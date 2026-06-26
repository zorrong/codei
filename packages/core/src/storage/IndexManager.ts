/**
 * IndexManager — high-level API orchestrating toàn bộ index lifecycle.
 * Dùng bởi CLI commands: index, update, status.
 */

import type { IndexTree } from "../types/TreeNode.js"
import type { LLMClient } from "../types/LLMClient.js"
import type { LanguageAdapter } from "../types/LanguageAdapter.js"
import type { ParsedFile } from "../types/RawSymbol.js"
import { TreeBuilder } from "../tree/TreeBuilder.js"
import { FileSystemIndexStore } from "../storage/FileSystemIndexStore.js"
import { FileScanner } from "../storage/FileScanner.js"
import { FileWatcher, type FileChange } from "./FileWatcher.js"
import { ParallelSymbolExtractor } from "../retrieval/ParallelSymbolExtractor.js"
import * as path from "path"
import type { SummaryMode } from "../llm/SummaryGenerator.js"

export interface IndexManagerOptions {
  projectRoot: string
  projectName?: string
  llmClient: LLMClient
  adapters: LanguageAdapter[]
  indexDir?: string
  verbose?: boolean
  summaryMode?: SummaryMode
}

export interface BuildResult {
  tree: IndexTree
  filesIndexed: number
  symbolsIndexed: number
  durationMs: number
}

export interface UpdateResult {
  tree: IndexTree
  filesUpdated: number
  filesDeleted: number
  filesNew: number
  durationMs: number
  upToDate: boolean
}

export interface StatusResult {
  exists: boolean
  totalFiles: number
  totalSymbols: number
  builtAt: number | null
  staleFiles: string[]
  isStale: boolean
}

export interface WatchOptions {
  debounceMs?: number
  onChange?: (change: FileChange) => void
  onBatch?: (changes: FileChange[]) => void
}

export class IndexManager {
  private readonly store: FileSystemIndexStore
  private readonly scanner: FileScanner
  private readonly builder: TreeBuilder
  private readonly log: (...args: unknown[]) => void
  private readonly options: IndexManagerOptions

  constructor(options: IndexManagerOptions) {
    this.options = options
    this.store = new FileSystemIndexStore(
      options.projectRoot,
      options.indexDir ?? ".index"
    )
    this.scanner = new FileScanner({
      projectRoot: options.projectRoot,
      extensions: this.getSupportedExtensions(),
    })
    this.builder = new TreeBuilder({
      projectRoot: options.projectRoot,
      ...(options.projectName !== undefined && { projectName: options.projectName }),
      llmClient: options.llmClient,
      ...(options.verbose !== undefined && { verbose: options.verbose }),
      ...(options.summaryMode !== undefined && { summaryMode: options.summaryMode }),
    })
    this.log = options.verbose === true ? console.log : () => {}
  }

  /**
   * Full index build — scan toàn bộ project, build tree từ đầu.
   */
  async build(): Promise<BuildResult> {
    const start = Date.now()
    this.log(`[IndexManager] Starting full build at ${this.options.projectRoot}...`)

    const allFiles = this.scanner.scan({}).allFiles
    this.log(`[IndexManager] Found ${allFiles.length} files`)

    const parsedFiles = await this.parseFiles(allFiles)
    this.log(`[IndexManager] Parsed ${parsedFiles.length} files`)

    const summaryCache = await this.store.loadSummaryCache()
    this.builder.setSummaryCache(summaryCache)

    const tree = await this.builder.build(parsedFiles)

    const symbolsIndexed = Object.values(tree.nodes).filter(
      (n) => n?.level === "symbol"
    ).length

    await this.store.saveTree(tree)
    const hashMap = this.scanner.buildHashMap(allFiles)
    await this.store.saveMeta({
      version: "1.0.0",
      projectRoot: this.options.projectRoot,
      gitHashMap: hashMap,
      builtAt: Date.now(),
      totalFiles: parsedFiles.length,
      totalSymbols: symbolsIndexed,
    })
    await this.store.saveSummaryCache(this.builder.getSummaryCache())

    const durationMs = Date.now() - start
    this.log(`[IndexManager] Build complete in ${durationMs}ms`)

    return { tree, filesIndexed: parsedFiles.length, symbolsIndexed, durationMs }
  }

  /**
   * Incremental update — chỉ re-index files đã thay đổi.
   */
  async update(): Promise<UpdateResult> {
    const start = Date.now()

    const meta = await this.store.loadMeta()
    const existingTree = await this.store.loadTree()
    const summaryCache = await this.store.loadSummaryCache()
    this.builder.setSummaryCache(summaryCache)

    if (!meta || !existingTree) {
      this.log("[IndexManager] No existing index — running full build...")
      const buildResult = await this.build()
      return {
        tree: buildResult.tree,
        filesUpdated: buildResult.filesIndexed,
        filesDeleted: 0,
        filesNew: 0,
        durationMs: buildResult.durationMs,
        upToDate: false,
      }
    }

    const scan = this.scanner.scan(meta.gitHashMap)
    const changedAndNew = [...scan.changedFiles, ...scan.newFiles]

    if (changedAndNew.length === 0 && scan.deletedFiles.length === 0) {
      this.log("[IndexManager] Index is up to date")
      return {
        tree: existingTree,
        filesUpdated: 0,
        filesDeleted: 0,
        filesNew: 0,
        durationMs: Date.now() - start,
        upToDate: true,
      }
    }

    this.log(
      `[IndexManager] Changes: ${scan.changedFiles.length} modified, ` +
      `${scan.newFiles.length} new, ${scan.deletedFiles.length} deleted`
    )

    const parsedChanged = await this.parseFiles(changedAndNew)
    let updatedTree = await this.builder.updatePartial(existingTree, parsedChanged)

    // Remove deleted file nodes
    for (const relPath of scan.deletedFiles) {
      const fileNodeId = `file:${relPath}`
      const fileNode = updatedTree.nodes[fileNodeId]
      if (fileNode) {
        for (const childId of fileNode.children) {
          delete updatedTree.nodes[childId]
        }
        delete updatedTree.nodes[fileNodeId]
      }
      await this.store.deleteFileNode(relPath)
    }

    // Save updated tree
    await this.store.saveTree(updatedTree)

    // Update hash map
    const newHashMap = { ...meta.gitHashMap }
    for (const absPath of changedAndNew) {
      const relPath = path.relative(this.options.projectRoot, absPath)
      newHashMap[relPath] = this.scanner.getFileHash(absPath)
    }
    for (const relPath of scan.deletedFiles) {
      delete newHashMap[relPath]
    }

    const totalSymbols = Object.values(updatedTree.nodes).filter(
      (n) => n?.level === "symbol"
    ).length

    await this.store.saveMeta({
      ...meta,
      gitHashMap: newHashMap,
      builtAt: Date.now(),
      totalFiles: Object.values(updatedTree.nodes).filter((n) => n?.level === "file").length,
      totalSymbols,
    })
    await this.store.saveSummaryCache(this.builder.getSummaryCache())

    return {
      tree: updatedTree,
      filesUpdated: scan.changedFiles.length,
      filesDeleted: scan.deletedFiles.length,
      filesNew: scan.newFiles.length,
      durationMs: Date.now() - start,
      upToDate: false,
    }
  }

  /**
   * Status check — report tình trạng index, không build gì.
   */
  async status(): Promise<StatusResult> {
    const exists = await this.store.exists()
    if (!exists) {
      return { exists: false, totalFiles: 0, totalSymbols: 0, builtAt: null, staleFiles: [], isStale: false }
    }

    const meta = await this.store.loadMeta()
    if (!meta) {
      return { exists: true, totalFiles: 0, totalSymbols: 0, builtAt: null, staleFiles: [], isStale: true }
    }

    const scan = this.scanner.scan(meta.gitHashMap)
    const staleFiles = [
      ...scan.changedFiles.map((f) => path.relative(this.options.projectRoot, f)),
      ...scan.newFiles.map((f) => path.relative(this.options.projectRoot, f)),
      ...scan.deletedFiles,
    ]

    return {
      exists: true,
      totalFiles: meta.totalFiles,
      totalSymbols: meta.totalSymbols,
      builtAt: meta.builtAt,
      staleFiles,
      isStale: staleFiles.length > 0,
    }
  }

  /**
   * Start watching for file changes and auto-update index.
   * Returns a cleanup function.
   */
  startWatching(options: WatchOptions = {}): () => void {
    const watcher = new FileWatcher(this.options.projectRoot, this.getSupportedExtensions(), {
      debounceMs: options.debounceMs ?? 500,
    })

    watcher.on("batch", async (changes: FileChange[]) => {
      this.log(`[IndexManager] Detected ${changes.length} file changes`)

      if (options.onBatch) {
        options.onBatch(changes)
      }

      const filePaths = changes
        .filter((c) => c.type !== "unlink")
        .map((c) => c.filePath)

      if (filePaths.length === 0) {
        if (changes.some((c) => c.type === "unlink")) {
          const deletedPaths = changes
            .filter((c) => c.type === "unlink")
            .map((c) => path.relative(this.options.projectRoot, c.filePath))
          await this.handleDeletedFiles(deletedPaths)
        }
        return
      }

      try {
        const parsedFiles = await this.parseFiles(filePaths)
        const existingTree = await this.store.loadTree()
        const meta = await this.store.loadMeta()
        if (existingTree) {
          const updatedTree = await this.builder.updatePartial(existingTree, parsedFiles)
          await this.store.saveTree(updatedTree)

          const deletedPaths = changes
            .filter((c) => c.type === "unlink")
            .map((c) => path.relative(this.options.projectRoot, c.filePath))
          if (deletedPaths.length > 0) {
            await this.handleDeletedFiles(deletedPaths)
          }

          if (meta) {
            const newHashMap = { ...meta.gitHashMap }
            for (const absPath of filePaths) {
              const relPath = path.relative(this.options.projectRoot, absPath)
              newHashMap[relPath] = this.scanner.getFileHash(absPath)
            }
            for (const relPath of deletedPaths) {
              delete newHashMap[relPath]
            }

            const finalTree =
              deletedPaths.length > 0 ? (await this.store.loadTree()) ?? updatedTree : updatedTree
            const totalFiles = Object.values(finalTree.nodes).filter((n) => n?.level === "file").length
            const totalSymbols = Object.values(finalTree.nodes).filter((n) => n?.level === "symbol").length

            await this.store.saveMeta({
              ...meta,
              gitHashMap: newHashMap,
              builtAt: Date.now(),
              totalFiles,
              totalSymbols,
            })
          }

          this.log(`[IndexManager] Index updated with ${parsedFiles.length} files`)
        }
      } catch (err) {
        this.log(`[IndexManager] Watch update failed: ${(err as Error).message}`)
      }
    })

    watcher.on("error", (error: Error) => {
      this.log(`[IndexManager] Watcher error: ${error.message}`)
    })

    watcher.start()

    return () => {
      watcher.stop()
    }
  }

  private async handleDeletedFiles(deletedPaths: string[]): Promise<void> {
    const tree = await this.store.loadTree()
    if (!tree) return

    for (const relPath of deletedPaths) {
      const fileNodeId = `file:${relPath}`
      const fileNode = tree.nodes[fileNodeId]
      if (fileNode) {
        for (const childId of fileNode.children) {
          delete tree.nodes[childId]
        }
        delete tree.nodes[fileNodeId]
      }
      await this.store.deleteFileNode(relPath)
    }

    await this.store.saveTree(tree)
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async parseFiles(filePaths: string[]): Promise<ParsedFile[]> {
    const extractor = new ParallelSymbolExtractor({
      adapters: this.options.adapters,
      projectRoot: this.options.projectRoot,
      concurrency: 10,
    })
    const { parsed, errors } = await extractor.parseFiles(filePaths)
    for (const err of errors) {
      console.warn(`[IndexManager] Failed to parse ${err}`)
    }
    return parsed
  }

  /**
   * Get list of supported extensions for display.
   */
  getSupportedExtensionsList(): string[] {
    return this.getSupportedExtensions()
  }

  private getSupportedExtensions(): string[] {
    return this.options.adapters.flatMap((a) => a.fileExtensions)
  }
}
