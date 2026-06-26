/**
 * `codeindex query "<text>"` — query index, trả về relevant code context.
 */

import type { Command } from "commander"
import * as path from "path"
import { loadConfig } from "../config.js"
import { createLLMClient, createIndexManager } from "../createServices.js"
import { FileSystemIndexStore, Retriever, TraversalCache } from "@codeindex/core"

export function registerQueryCommand(program: Command): void {
  program
    .command("query <text>")
    .description("Query index và trả về relevant code context")
    .option("--cwd <path>", "Project root directory", ".")
    .option("--max-tokens <n>", "Max tokens cho context output", "4000")
    .option("--no-deps", "Không expand dependencies")
    .option("--format <fmt>", "Output format: text | json", "text")
    .option("--max-symbols <n>", "Max symbols to include", "10")
    .option("-v, --verbose", "Show traversal path")
    .action(async (queryText: string, options: Record<string, string | boolean>) => {
      const projectRoot = path.resolve(options["cwd"] as string ?? ".")
      const config = loadConfig(projectRoot, {
        verbose: options["verbose"] === true,
      })

      // Load index
      const store = new FileSystemIndexStore(projectRoot, config.indexDir)
      const tree = await store.loadTree()

      if (!tree) {
        console.error(
          `❌ No index found at ${projectRoot}/${config.indexDir}/\n` +
          `   Run: codeindex index ${projectRoot}`
        )
        process.exit(1)
      }

      try {
        const llm = createLLMClient(config)
        const cache = new TraversalCache({
          persistencePath: path.join(projectRoot, config.indexDir, "traversal-cache.json"),
        })
        const retriever = new Retriever({
          llmClient: llm,
          cache,
          config: {
            maxOutputTokens: parseInt(options["maxTokens"] as string ?? "4000"),
            expandDeps: options["deps"] !== false,
            maxSymbols: parseInt(options["maxSymbols"] as string ?? "10"),
            depSymbolsIncludeBody: false,
          },
        })

        const result = await retriever.retrieve(tree, {
          query: queryText,
          maxOutputTokens: parseInt(options["maxTokens"] as string ?? "4000"),
          expandDeps: options["deps"] !== false,
        })

        const format = options["format"] as string ?? "text"

        if (format === "json") {
          console.log(JSON.stringify({
            query: result.query,
            estimatedTokens: result.estimatedTokens,
            traversalPath: result.traversalPath,
            files: result.files.map((f) => ({
              path: f.node.filePath,
              symbols: f.symbols.map((s) => s.node.title),
            })),
            context: result.formattedContext,
          }, null, 2))
        } else {
          // Text format — raw context sẵn sàng paste vào AI
          if (options["verbose"] === true) {
            console.error(`[codeindex] Query: "${queryText}"`)
            console.error(`[codeindex] Traversal: ${result.traversalPath.join(" → ")}`)
            console.error(`[codeindex] Tokens: ~${result.estimatedTokens}`)
            console.error("---")
          }

          console.log(result.formattedContext)
        }
      } catch (err) {
        console.error(`\n❌ Query failed: ${(err as Error).message}`)
        if (config.verbose) console.error((err as Error).stack)
        process.exit(1)
      }
    })
}
