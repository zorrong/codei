/**
 * `codeindex update` — incremental update sau git commit.
 */

import type { Command } from "commander"
import * as path from "path"
import { type CodeIndexConfig, loadConfig } from "../config.js"
import { createIndexManager, createLLMClient, createNoopLLMClient } from "../createServices.js"

export function registerUpdateCommand(program: Command): void {
  program
    .command("update [path]")
    .description("Incremental update index cho files đã thay đổi")
    .option("--index-dir <dir>", "Index directory")
    .option("-v, --verbose", "Verbose output")
    .action(async (targetPath: string | undefined, options: Record<string, string | boolean>) => {
      const projectRoot = path.resolve(targetPath ?? ".")

      const overrides: Partial<CodeIndexConfig> = {}
      if (options["indexDir"]) overrides.indexDir = options["indexDir"] as string
      if (options["verbose"]) overrides.verbose = options["verbose"] as boolean

      const config = loadConfig(projectRoot, overrides)


      try {
        const llm = (config.summaryMode ?? "auto") === "heuristic" ? createNoopLLMClient() : createLLMClient(config)
        const manager = await createIndexManager(projectRoot, config, llm)
        const result = await manager.update()

        if (result.upToDate) {
          console.log("✅ Index is up to date — no changes detected")
        } else {
          console.log("✅ Index updated!")
          if (result.filesUpdated > 0) console.log(`   Modified : ${result.filesUpdated} files`)
          if (result.filesNew > 0)     console.log(`   New      : ${result.filesNew} files`)
          if (result.filesDeleted > 0) console.log(`   Deleted  : ${result.filesDeleted} files`)
          console.log(`   Duration : ${(result.durationMs / 1000).toFixed(1)}s`)
        }
      } catch (err) {
        console.error(`\n❌ Update failed: ${(err as Error).message}`)
        if (config.verbose) console.error((err as Error).stack)
        process.exit(1)
      }
    })
}
