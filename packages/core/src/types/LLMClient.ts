/**
 * LLMClient — interface để giao tiếp với LLM.
 * Core engine không biết đang dùng OpenAI, Anthropic, hay local model.
 * User inject implementation phù hợp với setup của họ.
 */

export interface LLMMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export interface LLMRequest {
  messages: LLMMessage[]
  /** Max tokens cho response */
  maxTokens?: number
  /** Temperature: 0 = deterministic, 1 = creative. Default 0.2 cho reasoning tasks */
  temperature?: number
  /** Dùng để trace/debug — không affect behavior */
  requestLabel?: string
}

export interface LLMResponse {
  content: string
  /** Token usage để track cost */
  usage: {
    inputTokens: number
    outputTokens: number
  }
}

export interface LLMClient {
  /**
   * Gửi một request tới LLM và nhận response.
   * Implementation phải handle retry logic của riêng mình.
   */
  complete(request: LLMRequest): Promise<LLMResponse>
}

/**
 * Config chung cho LLM usage trong codei.
 * Có thể override per-operation nếu cần.
 */
export interface LLMConfig {
  /** Default max tokens cho summary generation */
  summaryMaxTokens: number
  /** Default max tokens cho traversal reasoning */
  traversalMaxTokens: number
  /** Temperature cho summary generation (thấp = consistent) */
  summaryTemperature: number
  /** Temperature cho traversal reasoning */
  traversalTemperature: number
}

export const DEFAULT_LLM_CONFIG: LLMConfig = {
  summaryMaxTokens: 300,
  traversalMaxTokens: 200,
  summaryTemperature: 0.1,
  traversalTemperature: 0.0,
}
