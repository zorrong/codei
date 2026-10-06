/**
 * `codei mcp` — MCP server qua stdio cho Claude Code / Cursor / Windsurf.
 * Tools: codei_query, codei_update, codei_status.
 */

import type { Command } from "commander"
import * as fsSync from "fs"
import * as path from "path"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { loadConfig } from "../config.js"
import { createIndexManager, createLLMClient, createNoopLLMClient } from "../createServices.js"
import {
  FileSystemIndexStore,
  Retriever,
  SymbolDependencyGraph,
  TraversalCache,
} from "pnftrading_codei-core"
import type { IndexTree, LLMClient } from "pnftrading_codei-core"
import type { CodeiConfig } from "../config.js"
import { logQuery } from "../telemetry.js"

export interface CodeiMcpDeps {
  projectRoot: string
  config: CodeiConfig
  llmClient: LLMClient
  /** Cho test inject store/cache riêng. Mặc định dùng FileSystem + cache persist. */
  store?: FileSystemIndexStore | undefined
  cache?: TraversalCache | undefined
}

/** Tạo McpServer không gắn transport — test được qua InMemoryTransport. */
export function createCodeiMcpServer(deps: CodeiMcpDeps): McpServer {
  const { projectRoot, config, llmClient: llm } = deps
  const store = deps.store ?? new FileSystemIndexStore(projectRoot, config.indexDir)
  const cache =
    deps.cache ??
    new TraversalCache({
      persistencePath: path.join(projectRoot, config.indexDir, "traversal-cache.json"),
    })

      // P1-6: giữ tree trong RAM cho MCP (calls liên tiếp từ agent)
      let cachedTree: IndexTree | null = null
      let cachedMtimeMs = 0
      // Vòng 3-4: symbol đã gửi trong session — query sau chỉ nhận dòng tham chiếu.
      const sentSymbolIds = new Set<string>()
      async function loadTree(): Promise<IndexTree | null> {
        const treePath = path.join(projectRoot, config.indexDir, "tree.json")
        try {
          const mtimeMs = fsSync.statSync(treePath).mtimeMs
          if (cachedTree && mtimeMs === cachedMtimeMs) return cachedTree
          const tree = await store.loadTree()
          if (tree) {
            cachedTree = tree
            cachedMtimeMs = mtimeMs
            cache.setCacheKey(`tree:${tree.builtAt}`)
          }
          return tree
        } catch {
          const tree = await store.loadTree()
          if (tree) {
            cachedTree = tree
            cachedMtimeMs = 0
          }
          return tree
        }
      }

      const server = new McpServer({ name: "codei", version: "0.1.0" })

      server.tool(
        "codei_query",
        "Query codebase index, trả về relevant code context để trả lời câu hỏi.",
        {
          query: z.string().describe("Câu hỏi về codebase (VD: how does auth work?)"),
          maxTokens: z.number().int().min(100).max(16000).optional().describe("Max tokens cho context (default 4000)"),
          expandDeps: z.boolean().optional().describe("Có kèm dependency signatures không (default true)"),
          compact: z.boolean().optional().describe("Bỏ dòng trống + comment (default false)"),
          fresh: z.boolean().optional().describe("Bỏ qua session dedup, gửi lại full source (default false)"),
        },
        async ({ query, maxTokens, expandDeps, compact, fresh }) => {
          const tree = await loadTree()
          if (!tree) {
            return {
              content: [{ type: "text" as const, text: `No index found. Run: codei index ${projectRoot}` }],
              isError: true,
            }
          }
          const retriever = new Retriever({
            llmClient: llm,
            cache,
            config: {
              maxOutputTokens: maxTokens ?? 4000,
              expandDeps: expandDeps ?? true,
              maxSymbols: 10,
              depSymbolsIncludeBody: false,
              compact: compact ?? false,
              // Vòng 3-4: symbol session đã có thì chỉ render tham chiếu
              ...(fresh !== true &&
                sentSymbolIds.size > 0 && { alreadySentNodeIds: [...sentSymbolIds] }),
            },
          })
          const result = await retriever.retrieve(tree, { query })
          for (const f of result.files) {
            for (const s of f.symbols) sentSymbolIds.add(s.node.nodeId)
          }
          logQuery(projectRoot, config.indexDir, {
            ts: Date.now(),
            query,
            estimatedTokens: result.estimatedTokens,
            ...(result.rawTokens !== undefined && { rawTokens: result.rawTokens }),
            ...(result.savedPct !== undefined && { savedPct: result.savedPct }),
            files: result.files.map((f) => f.node.filePath),
          })
          const footer = `\n\n// tokens: ~${result.estimatedTokens} (saved ${result.savedPct ?? 0}%) | files: ${result.files.map((f) => f.node.filePath).join(", ")}`
          return { content: [{ type: "text" as const, text: result.formattedContext + footer }] }
        }
      )

      server.tool(
        "codei_update",
        "Incremental update index sau khi code thay đổi. Chỉ xoá cache liên quan file đổi.",
        {},
        async () => {
          const manager = await createIndexManager(projectRoot, config, llm)
          const result = await manager.update()
          cachedTree = null
          cachedMtimeMs = 0
          // Code đổi → line range trong tham chiếu session có thể lệch, gửi lại từ đầu
          sentSymbolIds.clear()
          let cacheInvalidated = 0
          if (!result.upToDate) {
            if (result.updatedFiles.length === 0) {
              cache.invalidate()
            } else {
              const graph = new SymbolDependencyGraph(result.tree)
              cacheInvalidated = cache.invalidateByIds(graph.getInvalidationIds(result.updatedFiles))
            }
            cache.flushSync()
          }
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  upToDate: result.upToDate,
                  filesUpdated: result.filesUpdated,
                  filesNew: result.filesNew,
                  filesDeleted: result.filesDeleted,
                  cacheInvalidated,
                  durationMs: result.durationMs,
                }),
              },
            ],
          }
        }
      )

      server.tool("codei_status", "Index health check: số file/symbol, stale files, cache stats.", {}, async () => {
        const manager = await createIndexManager(projectRoot, config, createNoopLLMClient())
        const status = await manager.status()
        return { content: [{ type: "text" as const, text: JSON.stringify({ ...status, cache: cache.stats() }) }] }
      })

      return server
}

export function registerMcpCommand(program: Command): void {
  program
    .command("mcp")
    .description("Start MCP server (stdio) for AI agents")
    .option("--cwd <path>", "Project root directory", ".")
    .option("--summary-mode <mode>", "Summary mode: heuristic | llm | auto")
    .action(async (options: Record<string, string | boolean>) => {
      const projectRoot = path.resolve(options["cwd"] as string ?? ".")
      const config = loadConfig(projectRoot, {
        ...(options["summaryMode"] !== undefined && { summaryMode: options["summaryMode"] as any }),
      })

      const llm =
        (config.summaryMode ?? "auto") === "heuristic"
          ? createNoopLLMClient()
          : createLLMClient(config)
      const server = createCodeiMcpServer({ projectRoot, config, llmClient: llm })

      const transport = new StdioServerTransport()
      await server.connect(transport)
    })
}
