/**
 * `codeindex index <path>` — build full index từ đầu.
 */

import type { Command } from "commander"
import * as path from "path"
import { type CodeIndexConfig, loadConfig } from "../config.js"
import { createIndexManager, createLLMClient, createNoopLLMClient } from "../createServices.js"

export function registerIndexCommand(program: Command): void {
  program
    .command("index [path]")
    .description("Build index từ codebase (full rebuild)")
    .option("--provider <provider>", "LLM provider: openai | anthropic | google | custom | ollama")
    .option("--model <model>", "LLM model name")
    .option("--index-dir <dir>", "Output directory cho index files", ".index")
    .option("--name <name>", "Project name")
    .option("-v, --verbose", "Verbose output")
    .action(async (targetPath: string | undefined, options: Record<string, string | boolean>) => {
      const projectRoot = path.resolve(targetPath ?? ".")

      // Chỉ lấy overrides từ CLI nếu nó được cung cấp
      const overrides: Partial<CodeIndexConfig> = {}
      if (options["provider"]) overrides.provider = options["provider"] as any
      if (options["model"]) overrides.model = options["model"] as string
      if (options["indexDir"]) overrides.indexDir = options["indexDir"] as string
      if (options["name"]) overrides.projectName = options["name"] as string
      if (options["verbose"]) overrides.verbose = options["verbose"] as boolean

      const config = loadConfig(projectRoot, overrides)


      console.log(`📁 Indexing: ${projectRoot}`)
      console.log(`🤖 Provider: ${config.provider} / ${config.model}`)
      console.log(`📂 Index dir: ${config.indexDir}`)
      console.log(`🧾 Summary mode: ${config.summaryMode ?? "auto"}`)
      console.log("")

      try {
        const llm = (config.summaryMode ?? "auto") === "heuristic" ? createNoopLLMClient() : createLLMClient(config)
        const manager = await createIndexManager(projectRoot, config, llm)
        const supportedExts = manager.getSupportedExtensionsList()
        console.log(`🔌 Adapters: ${supportedExts.join(", ")}`)
        console.log("")


        const result = await manager.build()

        console.log("")
        console.log("✅ Index built successfully!")
        console.log(`   Files indexed : ${result.filesIndexed}`)
        console.log(`   Symbols found : ${result.symbolsIndexed}`)
        console.log(`   Duration      : ${(result.durationMs / 1000).toFixed(1)}s`)
        console.log(`   Output        : ${projectRoot}/${config.indexDir}/`)
      } catch (err) {
        console.error(`\n❌ Index failed: ${(err as Error).message}`)
        if (config.verbose) console.error((err as Error).stack)
        process.exit(1)
      }
    })
}
