/**
 * Retriever — main entry point của retrieval pipeline.
 * Flow: TreeTraversal → DependencyExpander → ContextBuilder
 */

import type { IndexTree, FileNode, SymbolNode } from "../types/TreeNode.js"
import type { RetrievalQuery, RetrievalResult, RetrievalConfig } from "../types/Retrieval.js"
import type { LLMClient } from "../types/LLMClient.js"
import { DEFAULT_RETRIEVAL_CONFIG } from "../types/Retrieval.js"
import { TreeTraversal } from "../tree/TreeTraversal.js"
import { DependencyExpander } from "./DependencyExpander.js"
import { ContextBuilder } from "./ContextBuilder.js"
import { TraversalCache } from "./TraversalCache.js"

export interface RetrieverOptions {
  llmClient: LLMClient
  config?: Partial<RetrievalConfig>
  cache?: TraversalCache
}

export class Retriever {
  private readonly config: RetrievalConfig
  private readonly llmClient: LLMClient
  private readonly contextBuilder: ContextBuilder
  private readonly depExpander: DependencyExpander
  private readonly cache: TraversalCache | undefined

  constructor(options: RetrieverOptions) {
    this.config = { ...DEFAULT_RETRIEVAL_CONFIG, ...options.config }
    this.llmClient = options.llmClient
    this.contextBuilder = new ContextBuilder()
    this.depExpander = new DependencyExpander()
    this.cache = options.cache
  }

  async retrieve(tree: IndexTree, query: RetrievalQuery): Promise<RetrievalResult> {
    const config: RetrievalConfig = {
      ...this.config,
      ...(query.maxSymbols !== undefined && { maxSymbols: query.maxSymbols }),
      ...(query.expandDeps !== undefined && { expandDeps: query.expandDeps }),
      ...(query.maxOutputTokens !== undefined && { maxOutputTokens: query.maxOutputTokens }),
      ...(query.compact !== undefined && { compact: query.compact }),
    }

    const cached = this.cache?.get(query.query, tree) ?? this.cache?.findSimilar(query.query, tree)
    let selectedFiles: FileNode[]
    let selectedSymbols: SymbolNode[]
    let path: string[]
    let symbolScores: Record<string, number> | undefined
    let reasoning: string

    if (cached) {
      selectedFiles = cached.selectedFiles
      selectedSymbols = cached.selectedSymbols
      path = cached.path
      symbolScores = cached.symbolScores
      reasoning = "Cached traversal result"
    } else {
      const traversal = new TreeTraversal({
        llmClient: this.llmClient,
        maxSymbols: config.maxSymbols,
      })

      const result = await traversal.traverse(tree, query.query)
      selectedFiles = result.selectedFiles
      selectedSymbols = result.selectedSymbols
      path = result.path
      symbolScores = result.symbolScores
      reasoning = "Selected by LLM traversal"

      this.cache?.set(query.query, { selectedFiles, selectedSymbols, path, symbolScores })
    }

    // Step 2: Expand 1-hop dependencies
    const selectedSymbolIds = new Set(selectedSymbols.map((s) => s.nodeId))
    const deps = config.expandDeps
      ? this.depExpander.expand(tree, selectedSymbols, selectedSymbolIds)
      : []

    // Step 3: Build formatted context
    const { context, estimatedTokens } = this.contextBuilder.build({
      selectedSymbols,
      selectedFiles,
      deps,
      config,
      ...(symbolScores !== undefined && { symbolScores }),
    })

    // P2-12: ước lượng token nếu dump toàn bộ file được chọn
    const rawTokens = this.estimateRawTokens(tree, selectedFiles)

    return {
      query: query.query,
      files: selectedFiles.map((fileNode) => ({
        node: fileNode,
        symbols: selectedSymbols
          .filter((s) => s.filePath === fileNode.filePath)
          .map((s) => ({
            node: s,
            relevanceScore: symbolScores?.[s.nodeId] ?? 1.0,
            reasoning,
            role: "direct" as const,
          })),
      })),
      formattedContext: context,
      estimatedTokens,
      traversalPath: path,
      rawTokens,
      savedPct: rawTokens > 0 ? Math.max(0, Math.min(100, Math.round((1 - estimatedTokens / rawTokens) * 100))) : 0,
    }
  }

  private estimateRawTokens(tree: IndexTree, files: FileNode[]): number {
    let chars = 0
    for (const file of files) {
      for (const symId of file.children) {
        const node = tree.nodes[symId]
        if (node?.level === "symbol") chars += (node as SymbolNode).fullSource.length
      }
    }
    return Math.ceil(chars / 4)
  }
}
