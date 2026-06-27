/**
 * `codei status` — show index health và stats.
 */

import type { Command } from "commander"
import * as fs from "fs/promises"
import * as path from "path"
import { type CodeiConfig, loadConfig } from "../config.js"
import { createIndexManager, createNoopLLMClient } from "../createServices.js"
import { FileSystemIndexStore, TraversalCache } from "pnftrading_codei-core"

export function registerStatusCommand(program: Command): void {
  program
    .command("status [path]")
    .description("Show index health và stats")
    .option("--index-dir <dir>", "Index directory")
    .option("--json", "Output as JSON")
    .option("--clear-cache", "Clear traversal cache for this project")
    .action(async (targetPath: string | undefined, options: Record<string, string | boolean>) => {
      const projectRoot = path.resolve(targetPath ?? ".")

      const overrides: Partial<CodeiConfig> = {}
      if (options["indexDir"]) overrides.indexDir = options["indexDir"] as string

      const config = loadConfig(projectRoot, overrides)


      try {
        const manager = await createIndexManager(projectRoot, config, createNoopLLMClient())
        const status = await manager.status()

        const store = new FileSystemIndexStore(projectRoot, config.indexDir)
        const tree = await store.loadTree()
        const traversalCachePath = path.join(projectRoot, config.indexDir, "traversal-cache.json")

        const cacheKey = tree ? `tree:${tree.builtAt}` : undefined
        const cache = new TraversalCache({
          persistencePath: traversalCachePath,
          ...(cacheKey !== undefined && { cacheKey }),
        })

        if (options["clearCache"] === true) {
          cache.invalidate()
        }

        const cacheStats = cacheKey
          ? { cacheKey, ...cache.stats() }
          : { cacheKey: null, ...cache.stats() }

        let traversalCacheBytes: number | null = null
        try {
          traversalCacheBytes = (await fs.stat(traversalCachePath)).size
        } catch {
          traversalCacheBytes = null
        }

        if (options["json"] === true) {
          console.log(JSON.stringify({
            ...status,
            summaryMode: config.summaryMode ?? null,
            caches: {
              traversal: {
                path: traversalCachePath,
                bytes: traversalCacheBytes,
                ...cacheStats,
              },
            },
          }, null, 2))
          return
        }

        if (!status.exists) {
          console.log("❌ No index found")
          console.log(`   Run: codei index ${projectRoot}`)
          return
        }

        const builtAtStr = status.builtAt
          ? new Date(status.builtAt).toLocaleString()
          : "unknown"

        console.log(`📊 Index Status: ${projectRoot}`)
        console.log(`   Status    : ${status.isStale ? "⚠️  Stale" : "✅ Up to date"}`)
        console.log(`   Built at  : ${builtAtStr}`)
        console.log(`   Files     : ${status.totalFiles}`)
        console.log(`   Symbols   : ${status.totalSymbols}`)
        console.log(`   Summary   : ${config.summaryMode ?? "auto"}`)
        console.log(`   CacheKey  : ${cacheKey ?? "unknown"}`)
        console.log(`   CacheSize : ${cacheStats.size} entries (${traversalCacheBytes ?? 0} bytes)`)
        if (options["clearCache"] === true) {
          console.log(`   Cache     : cleared`)
        }

        if (status.staleFiles.length > 0) {
          console.log(`\n⚠️  Stale files (${status.staleFiles.length}):`)
          for (const f of status.staleFiles.slice(0, 10)) {
            console.log(`   - ${f}`)
          }
          if (status.staleFiles.length > 10) {
            console.log(`   ... and ${status.staleFiles.length - 10} more`)
          }
          console.log(`\n   Run: codei update`)
        }
      } catch (err) {
        console.error(`\n❌ Status check failed: ${(err as Error).message}`)
        process.exit(1)
      }
    })
}
