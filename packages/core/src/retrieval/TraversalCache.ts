/**
 * TraversalCache — LRU cache for query traversal results.
 * P1-7: chỉ lưu nodeId (không lưu full source) để file cache gọn ~90%.
 */

import type { TraversalResult } from "../tree/TreeTraversal.js"
import type { FileNode, IndexTree, SymbolNode } from "../types/TreeNode.js"
import * as fsSync from "fs"
import * as path from "path"

export interface CachedTraversalIds {
  fileIds: string[]
  symbolIds: string[]
  path: string[]
  symbolScores?: Record<string, number> | undefined
}

interface CacheEntry {
  result: CachedTraversalIds
  queryHash: string
  originalQuery: string
  timestamp: number
  hitCount: number
}

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000

export class TraversalCache {
  private readonly cache: Map<string, CacheEntry> = new Map()
  private readonly maxEntries: number
  private readonly ttlMs: number
  private readonly persistencePath: string | undefined
  private readonly persistenceDebounceMs: number
  private cacheKey: string | undefined
  private flushTimer: ReturnType<typeof setTimeout> | null = null

  constructor(options: {
    maxEntries?: number
    ttlMs?: number
    persistencePath?: string
    persistenceDebounceMs?: number
    cacheKey?: string
  } = {}) {
    this.maxEntries = options.maxEntries ?? 1000
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
    this.persistencePath = options.persistencePath
    this.persistenceDebounceMs = options.persistenceDebounceMs ?? 400
    this.cacheKey = options.cacheKey

    if (this.persistencePath && fsSync.existsSync(this.persistencePath)) {
      try {
        const raw = fsSync.readFileSync(this.persistencePath, "utf-8")
        const parsed = JSON.parse(raw) as unknown
        const { fileCacheKey, entries } = this.parsePersisted(parsed)
        // P2-15: không xoá toàn bộ khi builtAt đổi — entries chỉ lưu id,
        // resolve lười qua tree hiện tại, mục stale được loại khi resolve.
        if (!this.cacheKey && fileCacheKey) this.cacheKey = fileCacheKey
        for (const entry of entries) {
          const key = this.hashQuery(entry.originalQuery)
          this.cache.set(key, {
            result: entry.result,
            queryHash: key,
            originalQuery: entry.originalQuery,
            timestamp: entry.timestamp,
            hitCount: entry.hitCount,
          })
        }
      } catch {}
    }
  }

  /** P2-15: đổi key theo tree mới mà không xoá entries (stale loại khi resolve). */
  setCacheKey(cacheKey: string): void {
    if (this.cacheKey === cacheKey) return
    this.cacheKey = cacheKey
    this.scheduleFlush()
  }

  /** Resolve IDs thành nodes từ tree hiện tại. Trả null nếu không còn symbol nào. */
  private resolve(tree: IndexTree, ids: CachedTraversalIds): TraversalResult | null {
    const selectedFiles: FileNode[] = []
    for (const id of ids.fileIds) {
      const node = tree.nodes[id]
      if (node?.level === "file") selectedFiles.push(node as FileNode)
    }
    const selectedSymbols: SymbolNode[] = []
    for (const id of ids.symbolIds) {
      const node = tree.nodes[id]
      if (node?.level === "symbol") selectedSymbols.push(node as SymbolNode)
    }
    if (selectedSymbols.length === 0) return null
    return {
      selectedFiles,
      selectedSymbols,
      path: ids.path,
      ...(ids.symbolScores !== undefined && { symbolScores: ids.symbolScores }),
    }
  }

  get(query: string, tree: IndexTree): TraversalResult | null {
    const key = this.hashQuery(query)
    const entry = this.cache.get(key)

    if (!entry) return null

    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key)
      return null
    }

    const resolved = this.resolve(tree, entry.result)
    if (!resolved) {
      this.cache.delete(key)
      return null
    }

    entry.hitCount++
    return resolved
  }

  peek(query: string, similarityThreshold = 0.8): { kind: "exact" | "similar" } | null {
    const key = this.hashQuery(query)
    const entry = this.cache.get(key)
    if (entry && Date.now() - entry.timestamp <= this.ttlMs) {
      return { kind: "exact" }
    }

    const queryWords = this.tokenize(query)
    const querySet = new Set(queryWords)

    let bestScore = 0

    for (const e of this.cache.values()) {
      if (Date.now() - e.timestamp > this.ttlMs) continue
      const entryWords = this.tokenize(e.originalQuery)
      const entrySet = new Set(entryWords)
      const intersection = [...querySet].filter((w) => entrySet.has(w)).length
      const union = new Set([...querySet, ...entrySet]).size
      const score = union === 0 ? 0 : intersection / union
      if (score >= similarityThreshold && score > bestScore) {
        bestScore = score
      }
    }

    if (bestScore > 0) {
      return { kind: "similar" }
    }

    return null
  }

  set(query: string, result: TraversalResult): void {
    if (this.cache.size >= this.maxEntries) {
      this.evictLRU()
    }

    const key = this.hashQuery(query)
    const ids: CachedTraversalIds = {
      fileIds: result.selectedFiles.map((f) => f.nodeId),
      symbolIds: result.selectedSymbols.map((s) => s.nodeId),
      path: result.path,
      ...(result.symbolScores !== undefined && { symbolScores: result.symbolScores }),
    }
    this.cache.set(key, {
      result: ids,
      queryHash: key,
      originalQuery: query,
      timestamp: Date.now(),
      hitCount: 0,
    })

    this.scheduleFlush()
  }

  findSimilar(query: string, tree: IndexTree, similarityThreshold = 0.8): TraversalResult | null {
    const queryWords = this.tokenize(query)
    const querySet = new Set(queryWords)

    let bestMatch: CacheEntry | null = null
    let bestScore = 0

    for (const entry of this.cache.values()) {
      if (Date.now() - entry.timestamp > this.ttlMs) continue

      const entryWords = this.tokenize(entry.originalQuery)
      const entrySet = new Set(entryWords)

      const intersection = [...querySet].filter((w) => entrySet.has(w)).length
      const union = new Set([...querySet, ...entrySet]).size
      const score = union === 0 ? 0 : intersection / union

      if (score >= similarityThreshold && score > bestScore) {
        bestScore = score
        bestMatch = entry
      }
    }

    if (bestMatch) {
      const resolved = this.resolve(tree, bestMatch.result)
      if (!resolved) return null
      bestMatch.hitCount++
      return resolved
    }

    return null
  }

  invalidate(pattern?: string): void {
    if (!pattern) {
      this.cache.clear()
      this.scheduleFlush()
      return
    }

    for (const [key] of this.cache) {
      if (key.includes(pattern)) {
        this.cache.delete(key)
      }
    }
    this.scheduleFlush()
  }

  /** P2-15: xoá entries chứa bất kỳ id nào trong set (file đổi). Trả số entry đã xoá. */
  invalidateByIds(ids: Set<string>): number {
    let removed = 0
    for (const [key, entry] of this.cache) {
      const hit =
        entry.result.fileIds.some((id) => ids.has(id)) ||
        entry.result.symbolIds.some((id) => ids.has(id))
      if (hit) {
        this.cache.delete(key)
        removed++
      }
    }
    if (removed > 0) this.scheduleFlush()
    return removed
  }

  stats(): {
    size: number
    maxEntries: number
    hitRate: number
    oldestEntry: number | null
  } {
    let totalHits = 0
    let oldest: number | null = null

    for (const entry of this.cache.values()) {
      totalHits += entry.hitCount
      if (oldest === null || entry.timestamp < oldest) {
        oldest = entry.timestamp
      }
    }

    return {
      size: this.cache.size,
      maxEntries: this.maxEntries,
      hitRate: totalHits / Math.max(1, this.cache.size),
      oldestEntry: oldest,
    }
  }

  private evictLRU(): void {
    let oldestKey: string | null = null
    let oldestTime = Infinity
    let lowestHits = Infinity
    let lruKey: string | null = null

    for (const [key, entry] of this.cache) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp
        oldestKey = key
      }
      if (entry.hitCount < lowestHits) {
        lowestHits = entry.hitCount
        lruKey = key
      }
    }

    const keyToDelete = lruKey ?? oldestKey
    if (keyToDelete) {
      this.cache.delete(keyToDelete)
    }
  }

  private scheduleFlush(): void {
    if (!this.persistencePath) return
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      this.flush()
    }, this.persistenceDebounceMs)
  }

  flushSync(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    this.flush()
  }

  private flush(): void {
    if (!this.persistencePath) return
    try {
      const entries = Array.from(this.cache.values()).map((e) => ({
        originalQuery: e.originalQuery,
        result: e.result,
        timestamp: e.timestamp,
        hitCount: e.hitCount,
      }))
      fsSync.mkdirSync(path.dirname(this.persistencePath), { recursive: true })
      fsSync.writeFileSync(
        this.persistencePath,
        JSON.stringify({ cacheKey: this.cacheKey ?? "", entries }),
        "utf-8"
      )
    } catch {}
  }

  private toIds(result: TraversalResult): CachedTraversalIds {
    return {
      fileIds: result.selectedFiles.map((f) => f.nodeId),
      symbolIds: result.selectedSymbols.map((s) => s.nodeId),
      path: result.path,
      ...(result.symbolScores !== undefined && { symbolScores: result.symbolScores }),
    }
  }

  private parsePersisted(
    parsed: unknown
  ): {
    fileCacheKey: string | undefined
    entries: Array<{
      originalQuery: string
      result: CachedTraversalIds
      timestamp: number
      hitCount: number
    }>
  } {
    const normalize = (raw: unknown): {
      originalQuery: string
      result: CachedTraversalIds
      timestamp: number
      hitCount: number
    } | null => {
      if (!raw || typeof raw !== "object") return null
      const obj = raw as Record<string, unknown>
      const originalQuery = typeof obj["originalQuery"] === "string" ? (obj["originalQuery"] as string) : ""
      if (!originalQuery) return null
      const timestamp = typeof obj["timestamp"] === "number" ? (obj["timestamp"] as number) : Date.now()
      const hitCount = typeof obj["hitCount"] === "number" ? (obj["hitCount"] as number) : 0
      const result = obj["result"] as Record<string, unknown> | undefined
      if (!result || typeof result !== "object") return null

      // Format mới: { fileIds, symbolIds, path }
      if (Array.isArray(result["fileIds"]) && Array.isArray(result["symbolIds"])) {
        return {
          originalQuery,
          result: {
            fileIds: result["fileIds"] as string[],
            symbolIds: result["symbolIds"] as string[],
            path: Array.isArray(result["path"]) ? (result["path"] as string[]) : [],
            ...((result["symbolScores"] as Record<string, number> | undefined) !== undefined && {
              symbolScores: result["symbolScores"] as Record<string, number>,
            }),
          },
          timestamp,
          hitCount,
        }
      }

      // Format cũ: { selectedFiles: FileNode[], selectedSymbols: SymbolNode[], path }
      if (Array.isArray(result["selectedFiles"]) && Array.isArray(result["selectedSymbols"])) {
        const files = result["selectedFiles"] as Array<{ nodeId?: string }>
        const symbols = result["selectedSymbols"] as Array<{ nodeId?: string }>
        return {
          originalQuery,
          result: {
            fileIds: files.map((f) => f.nodeId ?? "").filter(Boolean),
            symbolIds: symbols.map((s) => s.nodeId ?? "").filter(Boolean),
            path: Array.isArray(result["path"]) ? (result["path"] as string[]) : [],
            ...((result["symbolScores"] as Record<string, number> | undefined) !== undefined && {
              symbolScores: result["symbolScores"] as Record<string, number>,
            }),
          },
          timestamp,
          hitCount,
        }
      }

      return null
    }

    if (Array.isArray(parsed)) {
      return {
        fileCacheKey: undefined,
        entries: parsed.map(normalize).filter((e): e is NonNullable<typeof e> => e !== null),
      }
    }

    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>
      const fileCacheKey = typeof obj["cacheKey"] === "string" ? (obj["cacheKey"] as string) : undefined
      const rawEntries = obj["entries"]
      if (Array.isArray(rawEntries)) {
        return {
          fileCacheKey,
          entries: rawEntries.map(normalize).filter((e): e is NonNullable<typeof e> => e !== null),
        }
      }
    }

    return { fileCacheKey: undefined, entries: [] }
  }

  private hashQuery(query: string): string {
    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .sort()
      .join(" ")
  }

  private tokenize(text: string): string[] {
    return text.toLowerCase().split(/\s+/).filter(Boolean)
  }
}

export class TraversalCacheManager {
  private caches: Map<string, TraversalCache> = new Map()

  getCache(projectRoot: string): TraversalCache {
    let cache = this.caches.get(projectRoot)
    if (!cache) {
      cache = new TraversalCache()
      this.caches.set(projectRoot, cache)
    }
    return cache
  }

  clearCache(projectRoot?: string): void {
    if (projectRoot) {
      this.caches.get(projectRoot)?.invalidate()
    } else {
      for (const cache of this.caches.values()) {
        cache.invalidate()
      }
    }
  }

  getStats(projectRoot: string): ReturnType<TraversalCache["stats"]> | null {
    return this.caches.get(projectRoot)?.stats() ?? null
  }
}
