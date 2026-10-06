/**
 * Retrieval types — định nghĩa input/output của retrieval engine.
 */

import type { SymbolNode, FileNode } from "./TreeNode.js"

export interface RetrievalQuery {
  /** Natural language query từ user/AI */
  query: string

  /**
   * Số lượng symbols tối đa trả về.
   * Default: 10
   */
  maxSymbols?: number

  /**
   * Có expand 1-hop dependencies không.
   * Khi true, các symbol mà result symbols depend on cũng được include (signature only).
   * Default: true
   */
  expandDeps?: boolean

  /**
   * Giới hạn token tối đa cho context output.
   * Retriever sẽ prune bớt nếu vượt quá.
   * Default: 4000
   */
  maxOutputTokens?: number

  /**
   * Bỏ dòng trống + dòng chỉ chứa comment để giảm token.
   * Default: false
   */
  compact?: boolean
}

export interface RetrievedSymbol {
  node: SymbolNode
  /** Score từ 0-1, cao hơn = relevant hơn */
  relevanceScore: number
  /** Lý do LLM chọn symbol này */
  reasoning: string
  /** Là direct result hay 1-hop dependency */
  role: "direct" | "dependency"
}

export interface RetrievedFile {
  node: FileNode
  /** Symbols được chọn từ file này */
  symbols: RetrievedSymbol[]
}

export interface RetrievalResult {
  query: string
  /** Files được chọn, sorted by relevance */
  files: RetrievedFile[]
  /**
   * Context string đã được format, sẵn sàng inject vào LLM prompt.
   * Format:
   *   === src/auth/auth.service.ts ===
   *   // AuthService — Handles JWT auth, login, token validation
   *   async login(dto: LoginDto): Promise<TokenPair> { ... }
   *   ...
   */
  formattedContext: string
  /** Estimated token count của formattedContext */
  estimatedTokens: number
  /** Traversal path LLM đã đi qua — useful để debug */
  traversalPath: string[]
  /** P2-12: tổng token nếu dump toàn bộ file được chọn (ước lượng) */
  rawTokens?: number | undefined
  /** P2-12: % token tiết kiệm so với dump toàn bộ (0-100) */
  savedPct?: number | undefined
}

/**
 * Config cho retrieval behavior.
 */
export interface RetrievalConfig {
  maxSymbols: number
  expandDeps: boolean
  maxOutputTokens: number
  /** Include full source hay chỉ signature cho dependency symbols */
  depSymbolsIncludeBody: boolean
  /** P2-13: bỏ dòng trống + comment để giảm token */
  compact: boolean
  /**
   * Vòng 3-2: số symbol top-score được render full body, từ hạng này trở đi
   * chỉ in signature. Default: 3.
   */
  fullBodyTopN?: number
  /** Vòng 3-3: bỏ symbol có score < ratio * score cao nhất. Default: 0.3. */
  scoreCutoffRatio?: number
  /**
   * Vòng 3-4: nodeId các symbol mà phía nhận đã có (session MCP) —
   * chỉ render dòng tham chiếu, không gửi lại source.
   */
  alreadySentNodeIds?: string[]
}

export const DEFAULT_RETRIEVAL_CONFIG: RetrievalConfig = {
  maxSymbols: 10,
  expandDeps: true,
  maxOutputTokens: 4000,
  depSymbolsIncludeBody: false,
  compact: false,
}
