/**
 * ContextBuilder — assemble final context string từ selected symbols + deps.
 * Output được format sẵn để inject vào AI prompt.
 */

import type { SymbolNode, FileNode } from "../types/TreeNode.js"
import type { ExpandedDep } from "./DependencyExpander.js"
import type { RetrievalConfig } from "../types/Retrieval.js"

export interface ContextInput {
  selectedSymbols: SymbolNode[]
  selectedFiles: FileNode[]
  deps: ExpandedDep[]
  config: RetrievalConfig
  /** P2-14: điểm relevance 0-1 theo symbol nodeId */
  symbolScores?: Record<string, number> | undefined
}

export const MAX_SYMBOL_TOKENS = 400

export class ContextBuilder {
  /**
   * Build formatted context string.
   *
   * Format:
   * === src/auth/auth.service.ts ===
   * // AuthService — Handles JWT auth...
   * class AuthService { ... }
   *
   * // --- Dependencies (signatures only) ---
   * // src/user/user.service.ts
   * class UserService { ... }
   */
  build(input: ContextInput): { context: string; estimatedTokens: number } {
    const scores = input.symbolScores ?? {}
    // P0-2: sort direct symbols theo score giảm dần, giữ thứ tự gốc khi bằng điểm
    const sortedSymbols = input.selectedSymbols
      .map((sym, index) => ({ sym, index, score: scores[sym.nodeId] ?? 1 }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map((entry) => entry.sym)

    const symbolBlocks = sortedSymbols.map((sym) => ({
      nodeId: sym.nodeId,
      filePath: sym.filePath,
      score: scores[sym.nodeId] ?? 1,
      text: this.renderSymbol(sym, input.config.compact),
      tokens: this.estimateTokens(this.renderSymbol(sym, input.config.compact)),
    }))

    const depBlocks = (input.config.expandDeps ? input.deps : []).map((dep) => {
      const raw = input.config.depSymbolsIncludeBody ? dep.symbol.fullSource : dep.signatureOnly
      const text = input.config.compact ? this.compactSource(raw) : raw
      return {
        nodeId: dep.symbol.nodeId,
        filePath: dep.fileNode.filePath,
        text,
        tokens: this.estimateTokens(text),
      }
    })

    const maxTokens = input.config.maxOutputTokens
    // Ưu tiên: direct theo score → deps. Bỏ deps trước, rồi direct điểm thấp.
    let keptSymbols = [...symbolBlocks]
    let keptDeps = [...depBlocks]
    let omittedSymbols = 0
    let omittedDeps = 0

    const totalTokens = () =>
      keptSymbols.reduce((sum, b) => sum + b.tokens, 0) +
      keptDeps.reduce((sum, b) => sum + b.tokens, 0) +
      // dự phòng header file (~10 tokens/file)
      new Set([...keptSymbols, ...keptDeps].map((b) => b.filePath)).size * 10

    while (keptDeps.length > 0 && totalTokens() > maxTokens) {
      keptDeps.pop()
      omittedDeps++
    }
    while (keptSymbols.length > 0 && totalTokens() > maxTokens) {
      // bỏ symbol điểm thấp nhất (cuối mảng đã sort)
      // nhưng giữ lại ít nhất 1 symbolNếu nó đơn lẻ đã vượt limit thì render rút gọn đã xử lý ở P0-4
      if (keptSymbols.length === 1) break
      keptSymbols.pop()
      omittedSymbols++
    }

    const sections: string[] = []
    const symbolsByFile = new Map<string, typeof keptSymbols>()
    for (const block of keptSymbols) {
      const existing = symbolsByFile.get(block.filePath) ?? []
      existing.push(block)
      symbolsByFile.set(block.filePath, existing)
    }

    for (const [filePath, blocks] of symbolsByFile.entries()) {
      const fileNode = input.selectedFiles.find((f) => f.filePath === filePath)
      const fileHeader = `=== ${filePath} ===`
      const fileSummary = fileNode ? `// ${fileNode.shortSummary}` : ""
      sections.push([fileHeader, fileSummary, ...blocks.map((b) => b.text)].filter(Boolean).join("\n"))
    }

    if (keptDeps.length > 0) {
      const depLines: string[] = ["// --- Dependencies (signatures only) ---"]
      const depsByFile = new Map<string, typeof keptDeps>()
      for (const dep of keptDeps) {
        const existing = depsByFile.get(dep.filePath) ?? []
        existing.push(dep)
        depsByFile.set(dep.filePath, existing)
      }
      for (const [filePath, deps] of depsByFile.entries()) {
        depLines.push(`// ${filePath}`)
        for (const dep of deps) depLines.push(dep.text)
      }
      sections.push(depLines.join("\n"))
    }

    if (omittedSymbols > 0 || omittedDeps > 0) {
      sections.push(`// omitted: ${omittedSymbols} symbols, ${omittedDeps} deps (token limit)`)
    }

    const context = sections.join("\n\n")
    const estimatedTokens = Math.ceil(context.length / 4)
    return { context, estimatedTokens }
  }

  private renderSymbol(sym: SymbolNode, compact = false): string {
    const comment = sym.shortSummary !== sym.signature ? `// ${sym.shortSummary}\n` : ""
    const location = `// ${sym.filePath}:L${sym.startLine}-L${sym.endLine}`
    const raw = this.truncateLargeSymbol(sym)
    const source = compact ? this.compactSource(raw) : raw
    return `${comment}${source}\n${location}`
  }

  /** P0-4: rút gọn symbol vượt MAX_SYMBOL_TOKENS */
  private truncateLargeSymbol(sym: SymbolNode): string {
    if (this.estimateTokens(sym.fullSource) <= MAX_SYMBOL_TOKENS) return sym.fullSource
    const isClassLike = sym.kind === "class" || sym.kind === "interface" || /^class\s|^interface\s/.test(sym.signature)
    if (isClassLike) {
      const lines = sym.fullSource.split("\n")
      const members = lines.filter((line) => /^\s{2,4}(public|private|protected|async|static|readonly|get|set|\w+\s*\(|\w+\s*:)/.test(line))
      const header = sym.signature
      const body = members.slice(0, 20).join("\n")
      const omitted = Math.max(0, sym.endLine - sym.startLine + 1 - members.slice(0, 20).length - 2)
      return `${header} {\n${body}\n// ... ${omitted} lines omitted (L${sym.startLine}-L${sym.endLine})\n}`
    }
    // function/method dài: cắt theo dòng trong giới hạn token
    const maxChars = MAX_SYMBOL_TOKENS * 4
    const lines = sym.fullSource.split("\n")
    let acc = ""
    for (const line of lines) {
      if ((acc + line + "\n").length > maxChars) break
      acc += line + "\n"
    }
    const omitted = sym.fullSource.split("\n").length - acc.split("\n").length
    return `${acc.trimEnd()}\n// ... ${Math.max(0, omitted)} lines omitted (L${sym.startLine}-L${sym.endLine})`
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4)
  }

  /** P2-13: bỏ dòng trống + dòng chỉ chứa comment (không đụng string literal nhiều dòng). */
  compactSource(source: string): string {
    const out: string[] = []
    for (const line of source.split("\n")) {
      const trimmed = line.trim()
      if (trimmed === "") continue
      if (
        trimmed.startsWith("//") ||
        trimmed.startsWith("#") ||
        trimmed.startsWith("/*") ||
        trimmed.startsWith("*") ||
        trimmed.startsWith("*/")
      ) {
        continue
      }
      out.push(line)
    }
    return out.join("\n")
  }
}
