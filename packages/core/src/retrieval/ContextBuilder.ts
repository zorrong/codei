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

/** Vòng 3-2: số symbol top-score được render full body, còn lại signature-only. */
export const FULL_BODY_TOP_N = 3

/** Vòng 3-3: bỏ symbol có score < 30% score cao nhất. */
export const SCORE_CUTOFF_RATIO = 0.3

export class ContextBuilder {
  /**
   * Build formatted context string.
   *
   * Format:
   * === src/auth/auth.service.ts ===
   * class AuthService { ... }
   *
   * // --- Dependencies (signatures only) ---
   * // src/user/user.service.ts
   * class UserService { ... }
   *
   * Tiết kiệm token:
   * - bỏ symbol điểm thấp (<30% max), symbol lồng nhau (method trong class),
   * - top-3 score render full, còn lại chỉ signature,
   * - symbol đã gửi (session MCP) chỉ còn dòng tham chiếu.
   */
  build(input: ContextInput): { context: string; estimatedTokens: number } {
    const scores = input.symbolScores ?? {}
    const fullTopN = input.config.fullBodyTopN ?? FULL_BODY_TOP_N
    const cutoffRatio = input.config.scoreCutoffRatio ?? SCORE_CUTOFF_RATIO
    const alreadySent = new Set(input.config.alreadySentNodeIds ?? [])

    // P0-2: sort direct symbols theo score giảm dần, giữ thứ tự gốc khi bằng điểm
    const sorted = input.selectedSymbols
      .map((sym, index) => ({ sym, index, score: scores[sym.nodeId] ?? 1 }))
      .sort((a, b) => b.score - a.score || a.index - b.index)

    let omittedSymbols = 0
    let omittedDeps = 0

    // Vòng 3-3: cắt theo khoảng cách điểm (budget là trần, không phải mục tiêu)
    let kept = sorted
    if (sorted.length > 1) {
      const maxScore = sorted[0]?.score ?? 0
      if (maxScore > 0) {
        const floor = maxScore * cutoffRatio
        kept = sorted.filter((entry, i) => i === 0 || entry.score >= floor)
        omittedSymbols += sorted.length - kept.length
      }
    }

    // Vòng 3-1: bỏ symbol lồng nhau — method đã nằm trong fullSource của class
    // thì in 2 lần. Chỉ dedup khi container render full; class bị truncate
    // (chỉ còn danh sách member) thì method vẫn giữ nguyên giá trị.
    const deduped: typeof kept = []
    for (const entry of kept) {
      if (deduped.some((k) => this.containsSymbol(k.sym, entry.sym) && this.rendersFull(k.sym))) {
        omittedSymbols++
        continue
      }
      if (this.rendersFull(entry.sym)) {
        for (let i = deduped.length - 1; i >= 0; i--) {
          const k = deduped[i]
          if (k && this.containsSymbol(entry.sym, k.sym)) {
            deduped.splice(i, 1)
            omittedSymbols++
          }
        }
      }
      deduped.push(entry)
    }

    // Vòng 3-2 + 3-4: render theo hạng — top-N full body, còn lại signature,
    // symbol đã gửi rồi chỉ còn dòng tham chiếu.
    const symbolBlocks = deduped.map((entry, rank) => {
      let text: string
      if (alreadySent.has(entry.sym.nodeId)) {
        text = this.renderAlreadySent(entry.sym)
      } else if (rank < fullTopN) {
        text = this.renderFull(entry.sym, input.config.compact)
      } else {
        text = this.renderSignatureOnly(entry.sym)
      }
      return {
        nodeId: entry.sym.nodeId,
        filePath: entry.sym.filePath,
        score: entry.score,
        text,
        tokens: this.estimateTokens(text),
      }
    })

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
      // Vòng 3-5: bỏ dòng summary cấp file — khi đã có source của symbol
      // thì summary file (~30-50 tokens) gần như không thêm thông tin.
      sections.push([`=== ${filePath} ===`, ...blocks.map((b) => b.text)].join("\n"))
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
      sections.push(`// omitted: ${omittedSymbols} symbols, ${omittedDeps} deps (budget/cutoff/dedup)`)
    }

    const context = sections.join("\n\n")
    const estimatedTokens = Math.ceil(context.length / 4)
    return { context, estimatedTokens }
  }

  /** Vòng 3-1: outer chứa inner khi cùng file và line range bao trọn (strict —
   *  cùng range thì là 2 symbol ngang hàng, không dedup).
   */
  private containsSymbol(outer: SymbolNode, inner: SymbolNode): boolean {
    return (
      outer.nodeId !== inner.nodeId &&
      outer.filePath === inner.filePath &&
      outer.startLine <= inner.startLine &&
      outer.endLine >= inner.endLine &&
      (outer.startLine < inner.startLine || outer.endLine > inner.endLine)
    )
  }

  /** Container có render đủ full source không (không bị truncate P0-4). */
  private rendersFull(sym: SymbolNode): boolean {
    return this.estimateTokens(sym.fullSource) <= MAX_SYMBOL_TOKENS
  }

  private renderFull(sym: SymbolNode, compact = false): string {
    const comment = sym.shortSummary !== sym.signature ? `// ${sym.shortSummary}\n` : ""
    const location = `// ${sym.filePath}:L${sym.startLine}-L${sym.endLine}`
    const raw = this.truncateLargeSymbol(sym)
    const source = compact ? this.compactSource(raw) : raw
    return `${comment}${source}\n${location}`
  }

  /** Vòng 3-2: hạng thấp chỉ in signature + vị trí để agent hỏi tiếp khi cần. */
  private renderSignatureOnly(sym: SymbolNode): string {
    return `${sym.signature}\n// ${sym.filePath}:L${sym.startLine}-L${sym.endLine}`
  }

  /** Vòng 3-4: symbol phía nhận đã có — chỉ còn dòng tham chiếu. */
  private renderAlreadySent(sym: SymbolNode): string {
    return `// ${sym.title} — already sent (${sym.filePath}:L${sym.startLine}-L${sym.endLine})`
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
