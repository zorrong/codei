/**
 * Telemetry local (mục 3): log mỗi query vào `<indexDir>/query-log.jsonl`,
 * `codei stats` cộng dồn thành báo cáo tiết kiệm token. Chỉ lưu local,
 * không gửi đi đâu.
 */

import * as fsSync from "fs"
import * as path from "path"

export interface QueryLogEntry {
  ts: number
  query: string
  estimatedTokens: number
  rawTokens?: number | undefined
  savedPct?: number | undefined
  files: string[]
  cache?: string | undefined
  latencyMs?: number | undefined
}

export interface QueryStats {
  count: number
  totalTokens: number
  avgTokens: number
  totalRawTokens: number
  avgSavedPct: number
  since: number | null
}

export function queryLogPath(projectRoot: string, indexDir: string): string {
  return path.join(projectRoot, indexDir, "query-log.jsonl")
}

/** Ghi 1 dòng JSON vào log. Không bao giờ throw (telemetry không được làm hỏng query). */
export function logQuery(
  projectRoot: string,
  indexDir: string,
  entry: QueryLogEntry
): void {
  try {
    const line = JSON.stringify({ ...entry, query: entry.query.slice(0, 500) }) + "\n"
    fsSync.mkdirSync(path.dirname(queryLogPath(projectRoot, indexDir)), { recursive: true })
    fsSync.appendFileSync(queryLogPath(projectRoot, indexDir), line, "utf-8")
  } catch {
    // ignore
  }
}

export function readStats(projectRoot: string, indexDir: string): QueryStats & { entries: QueryLogEntry[] } {
  const empty: QueryStats & { entries: QueryLogEntry[] } = {
    count: 0,
    totalTokens: 0,
    avgTokens: 0,
    totalRawTokens: 0,
    avgSavedPct: 0,
    since: null,
    entries: [],
  }
  let raw: string
  try {
    raw = fsSync.readFileSync(queryLogPath(projectRoot, indexDir), "utf-8")
  } catch {
    return empty
  }
  const entries: QueryLogEntry[] = []
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue
    try {
      const e = JSON.parse(line) as QueryLogEntry
      if (typeof e.ts === "number" && typeof e.estimatedTokens === "number") entries.push(e)
    } catch {
      // bỏ dòng hỏng
    }
  }
  if (entries.length === 0) return empty
  const totalTokens = entries.reduce((s, e) => s + e.estimatedTokens, 0)
  const totalRawTokens = entries.reduce((s, e) => s + (e.rawTokens ?? 0), 0)
  const withSaved = entries.filter((e) => typeof e.savedPct === "number")
  return {
    count: entries.length,
    totalTokens,
    avgTokens: Math.round(totalTokens / entries.length),
    totalRawTokens,
    avgSavedPct:
      withSaved.length > 0
        ? Math.round(withSaved.reduce((s, e) => s + (e.savedPct ?? 0), 0) / withSaved.length)
        : 0,
    since: entries[0]?.ts ?? null,
    entries,
  }
}
