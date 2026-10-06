/**
 * `codei update` — incremental update sau git commit.
 */

import type { Command } from "commander"
import * as path from "path"
import { type CodeiConfig, loadConfig } from "../config.js"
import { createIndexManager, createLLMClient, createNoopLLMClient } from "../createServices.js"
import { FileSystemIndexStore, SymbolDependencyGraph, TraversalCache } from "pnftrading_codei-core"

/** P2-15: sau update chỉ xoá cache chạm tới file đổi, không xoá toàn bộ. */
export async function invalidateCacheForUpdate(
  projectRoot: string,
  indexDir: string,
  updatedFiles: string[],
  upToDate: boolean,
  getTree: () => Promise<import("pnftrading_codei-core").IndexTree | null>,
  cache?: TraversalCache
): Promise<number> {
  const traversalCache =
    cache ??
    new TraversalCache({
      persistencePath: path.join(projectRoot, indexDir, "traversal-cache.json"),
    })
  if (!upToDate && updatedFiles.length === 0) {
    // Full rebuild mà không rõ file đổi → xoá toàn bộ cho an toàn
    traversalCache.invalidate()
    traversalCache.flushSync()
    return -1
  }
  if (updatedFiles.length === 0) return 0
  const tree = await getTree()
  if (!tree) return 0
  const graph = new SymbolDependencyGraph(tree)
  const removed = traversalCache.invalidateByIds(graph.getInvalidationIds(updatedFiles))
  traversalCache.flushSync()
  return removed
}

export function registerUpdateCommand(program: Command): void {
  program
    .command("update [path]")
    .description("Incremental update index cho files đã thay đổi")
    .option("--index-dir <dir>", "Index directory")
    .option("--summary-mode <mode>", "Summary mode: heuristic | llm | auto")
    .option("-v, --verbose", "Verbose output")
    .action(async (targetPath: string | undefined, options: Record<string, string | boolean>) => {
      const projectRoot = path.resolve(targetPath ?? ".")

      const overrides: Partial<CodeiConfig> = {}
      if (options["indexDir"]) overrides.indexDir = options["indexDir"] as string
      if (options["summaryMode"]) overrides.summaryMode = options["summaryMode"] as any
      if (options["verbose"]) overrides.verbose = options["verbose"] as boolean

      const config = loadConfig(projectRoot, overrides)


      try {
        const llm = (config.summaryMode ?? "auto") === "heuristic" ? createNoopLLMClient() : createLLMClient(config)
        const manager = await createIndexManager(projectRoot, config, llm)
        const result = await manager.update()

        if (result.upToDate) {
          console.log("✅ Index is up to date — no changes detected")
        } else {
          const store = new FileSystemIndexStore(projectRoot, config.indexDir)
          const removed = await invalidateCacheForUpdate(
            projectRoot,
            config.indexDir,
            result.updatedFiles,
            result.upToDate,
            () => store.loadTree()
          )
          console.log("✅ Index updated!")
          if (result.filesUpdated > 0) console.log(`   Modified : ${result.filesUpdated} files`)
          if (result.filesNew > 0)     console.log(`   New      : ${result.filesNew} files`)
          if (result.filesDeleted > 0) console.log(`   Deleted  : ${result.filesDeleted} files`)
          if (removed >= 0) console.log(`   Cache    : invalidated ${removed} entries`)
          console.log(`   Duration : ${(result.durationMs / 1000).toFixed(1)}s`)
        }
      } catch (err) {
        console.error(`\n❌ Update failed: ${(err as Error).message}`)
        if (config.verbose) console.error((err as Error).stack)
        process.exit(1)
      }
    })
}
