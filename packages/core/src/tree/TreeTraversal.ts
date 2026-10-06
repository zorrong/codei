/**
 * TreeTraversal — navigate IndexTree theo query.
 * 3 levels: Project → Module → File → Symbol
 * Mỗi level chỉ feed summaries → rất ít token per LLM call.
 */

import type { IndexTree, ModuleNode, FileNode, SymbolNode } from "../types/TreeNode.js"
import type { LLMClient } from "../types/LLMClient.js"
import { TraversalReasoner, type NodeCandidate } from "../llm/TraversalReasoner.js"

export interface TraversalOptions {
  llmClient: LLMClient
  /** Max modules to explore. Default: 3 */
  maxModules?: number
  /** Max files to explore per module. Default: 5 */
  maxFiles?: number
  /** Max symbols to select. Default: 10 */
  maxSymbols?: number
}

export interface TraversalResult {
  selectedFiles: FileNode[]
  selectedSymbols: SymbolNode[]
  /** Breadcrumb path LLM đã traverse */
  path: string[]
  /** P2-14: điểm relevance 0-1 theo symbol nodeId */
  symbolScores?: Record<string, number> | undefined
}

export class TreeTraversal {
  private readonly reasoner: TraversalReasoner
  private readonly options: Required<TraversalOptions>

  constructor(options: TraversalOptions) {
    this.reasoner = new TraversalReasoner(options.llmClient)
    this.options = {
      llmClient: options.llmClient,
      maxModules: options.maxModules ?? 3,
      maxFiles: options.maxFiles ?? 5,
      maxSymbols: options.maxSymbols ?? 10,
    }
  }

  async traverse(tree: IndexTree, query: string): Promise<TraversalResult> {
    const path: string[] = []
    const selectedFiles: FileNode[] = []
    const selectedSymbols: SymbolNode[] = []

    const directFileResult = this.tryDirectFileTraversal(tree, query, path)
    if (directFileResult) {
      return directFileResult
    }

    const directSymbolResult = await this.tryDirectSymbolTraversal(tree, query, path)
    if (directSymbolResult) {
      return directSymbolResult
    }

    // ── Level 1: Find starting modules/files ───────────────────────────────
    let candidateNodes = tree.root.children.map((id) => tree.nodes[id]).filter(Boolean)

    // Auto-descend if root has only 1 child which is a module (common case)
    if (candidateNodes.length === 1 && candidateNodes[0]?.level === "module") {
      const rootMod = candidateNodes[0] as ModuleNode
      path.push(`root-descend [${rootMod.nodeId}]`)
      candidateNodes = rootMod.children.map((id) => tree.nodes[id]).filter(Boolean)
    }

    const moduleCandidates: NodeCandidate[] = candidateNodes
      .filter((n): n is ModuleNode => n?.level === "module")
      .map((n) => ({
        nodeId: n.nodeId,
        title: n.title,
        summary: n.shortSummary,
      }))

    let finalFileCandidates: NodeCandidate[] = candidateNodes
      .filter((n): n is FileNode => n?.level === "file")
      .map((n) => ({
        nodeId: n.nodeId,
        title: n.title,
        summary: n.shortSummary,
      }))

    // If we have modules, let LLM pick some
    if (moduleCandidates.length > 0) {
      const moduleDecision = await this.reasoner.selectNodes(
        query,
        moduleCandidates,
        "module",
        this.options.maxModules
      )
      path.push(`modules: [${moduleDecision.selectedIds.join(", ")}]`)

      // Collect files AND sub-modules from selected modules
      for (const moduleId of moduleDecision.selectedIds) {
        const moduleNode = tree.nodes[moduleId] as ModuleNode
        if (!moduleNode) continue

        for (const childId of moduleNode.children) {
          const childNode = tree.nodes[childId]
          if (childNode?.level === "file") {
            finalFileCandidates.push({
              nodeId: childNode.nodeId,
              title: childNode.title,
              summary: childNode.shortSummary,
            })
          } else if (childNode?.level === "module") {
            // Also add sub-modules as potential file candidates (treat them as groups)
            finalFileCandidates.push({
              nodeId: childNode.nodeId,
              title: `[Dir] ${childNode.title}`,
              summary: childNode.shortSummary,
            })
          }
        }
      }
    }

    // If after module expansion we still have no files, use all files as fallback
    if (finalFileCandidates.length === 0) {
      finalFileCandidates = this.getAllFileCandidates(tree)
    }

    return this.selectFilesAndSymbols(tree, query, finalFileCandidates, path)
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async selectFilesAndSymbols(
    tree: IndexTree,
    query: string,
    candidates: NodeCandidate[],
    path: string[]
  ): Promise<TraversalResult> {
    const selectedFiles: FileNode[] = []
    const selectedSymbols: SymbolNode[] = []

    if (candidates.length === 0) {
      return { selectedFiles, selectedSymbols, path }
    }

    const decision = await this.reasoner.selectNodes(
      query,
      candidates,
      "file",
      this.options.maxFiles
    )
    path.push(`selected: [${decision.selectedIds.join(", ")}]`)

    // Extract files and symbols from chosen nodes
    const symbolCandidates: NodeCandidate[] = []

    for (const id of decision.selectedIds) {
      const node = tree.nodes[id]
      if (!node) continue

      if (node.level === "file") {
        selectedFiles.push(node as FileNode)
        this.collectSymbols(node as FileNode, tree, symbolCandidates)
      } else if (node.level === "module") {
        // If LLM selected a sub-module at the "file" stage, explore its direct files
        const mod = node as ModuleNode
        for (const childId of mod.children) {
          const child = tree.nodes[childId]
          if (child?.level === "file") {
            selectedFiles.push(child as FileNode)
            this.collectSymbols(child as FileNode, tree, symbolCandidates)
          }
        }
      }
    }

    if (symbolCandidates.length > 0) {
      const symbolDecision = await this.reasoner.selectNodes(
        query,
        symbolCandidates,
        "symbol",
        this.options.maxSymbols
      )
      path.push(`symbols: [${symbolDecision.selectedIds.join(", ")}]`)

      for (const symId of symbolDecision.selectedIds) {
        const symNode = tree.nodes[symId]
        if (symNode?.level === "symbol") selectedSymbols.push(symNode as SymbolNode)
      }

      return { selectedFiles, selectedSymbols, path, symbolScores: symbolDecision.scores }
    }

    return { selectedFiles, selectedSymbols, path }
  }

  private collectSymbols(fileNode: FileNode, tree: IndexTree, candidates: NodeCandidate[]) {
    for (const symId of fileNode.children) {
      const symNode = tree.nodes[symId]
      if (symNode?.level === "symbol") {
        candidates.push({
          nodeId: symNode.nodeId,
          title: `${symNode.title} (${(symNode as SymbolNode).kind})`,
          summary: symNode.shortSummary,
        })
      }
    }
  }

  private getAllFileCandidates(tree: IndexTree): NodeCandidate[] {
    return Object.values(tree.nodes)
      .filter((n) => n?.level === "file")
      .map((n) => ({
        nodeId: n!.nodeId,
        title: n!.title,
        summary: n!.shortSummary,
      }))
  }

  /**
   * Mục 2: query trùng path file (vd `codei query src/auth/x.ts`) thì trả thẳng
   * file đó, khỏi gọi LLM. Khớp path đầy đủ trước, basename duy nhất sau.
   */
  private tryDirectFileTraversal(
    tree: IndexTree,
    query: string,
    path: string[]
  ): TraversalResult | null {
    const norm = query.trim().replace(/^["']|["']$/g, "").replace(/\\/g, "/").replace(/^\.\//, "")
    if (!norm || !/[/.]/.test(norm)) return null

    const files = Object.values(tree.nodes).filter(
      (n): n is FileNode => n?.level === "file"
    )
    if (files.length === 0) return null

    let match = files.find((f) => f.filePath === norm)
      ?? files.find((f) => norm.endsWith(`/${f.filePath}`))

    if (!match) {
      const base = norm.split("/").pop() ?? ""
      if (!base.includes(".")) return null
      const byBase = files.filter((f) => f.filePath.split("/").pop() === base)
      if (byBase.length !== 1 || !byBase[0]) return null
      match = byBase[0]
    }

    const selectedFiles = [match]
    const selectedSymbols = match.children
      .map((id) => tree.nodes[id])
      .filter((n): n is SymbolNode => n?.level === "symbol")
      .slice(0, this.options.maxSymbols)
    if (selectedSymbols.length === 0) return null

    const symbolScores: Record<string, number> = {}
    for (const s of selectedSymbols) symbolScores[s.nodeId] = 1

    path.push(`direct-file: [${match.nodeId}]`)
    return { selectedFiles, selectedSymbols, path, symbolScores }
  }

  private async tryDirectSymbolTraversal(
    tree: IndexTree,
    query: string,
    path: string[]
  ): Promise<TraversalResult | null> {
    if (!this.isDirectSymbolQuery(query)) {
      return null
    }

    const symbolCandidates: NodeCandidate[] = Object.values(tree.nodes)
      .filter((n): n is SymbolNode => n?.level === "symbol")
      .map((n) => ({
        nodeId: n.nodeId,
        title: `${n.title} (${n.kind})`,
        summary: n.shortSummary,
      }))

    if (symbolCandidates.length === 0) {
      return null
    }

    const decision = await this.reasoner.selectNodes(
      query,
      symbolCandidates,
      "symbol",
      this.options.maxSymbols
    )

    if (decision.selectedIds.length === 0) {
      return null
    }

    const selectedSymbols = decision.selectedIds
      .map((id) => tree.nodes[id])
      .filter((node): node is SymbolNode => node?.level === "symbol")

    if (selectedSymbols.length === 0) {
      return null
    }

    const filePaths = new Set(selectedSymbols.map((symbol) => symbol.filePath))
    const selectedFiles = Array.from(filePaths)
      .map((filePath) => tree.nodes[`file:${filePath}`])
      .filter((node): node is FileNode => node?.level === "file")

    if (selectedFiles.length === 0) {
      return null
    }

    path.push(`direct-symbols: [${decision.selectedIds.join(", ")}]`)
    return { selectedFiles, selectedSymbols, path, symbolScores: decision.scores }
  }

  private isDirectSymbolQuery(query: string): boolean {
    return query
      .split(/\s+/)
      .some((part) => /[a-z][A-Z]|[A-Z][a-z]+[A-Z]|[_./:-]/.test(part))
  }
}
