/**
 * OpenAILLMClient — implement LLMClient interface dùng OpenAI SDK.
 * Cũng hoạt động với bất kỳ OpenAI-compatible endpoint (Ollama, LM Studio, etc.)
 */

import OpenAI from "openai"
import type { LLMClient, LLMRequest, LLMResponse } from "@pnftrading/codei-core"

export interface OpenAILLMClientOptions {
  apiKey: string
  model?: string
  /** Custom base URL — dùng cho Ollama, LM Studio, OpenRouter, v.v. */
  baseURL?: string
  /** Max retries khi gặp rate limit. Default: 3 */
  maxRetries?: number
}

export class OpenAILLMClient implements LLMClient {
  private readonly client: OpenAI
  private readonly model: string
  private readonly maxRetries: number

  constructor(options: OpenAILLMClientOptions) {
    this.model = options.model ?? "gpt-4o"
    this.maxRetries = options.maxRetries ?? 3
    this.client = new OpenAI({
      apiKey: options.apiKey,
      ...(options.baseURL !== undefined && { baseURL: options.baseURL }),
      maxRetries: this.maxRetries,
    })
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: request.maxTokens ?? 1000,
      temperature: request.temperature ?? 0.1,
    })

    const content = response.choices[0]?.message?.content ?? ""
    const usage = response.usage

    return {
      content,
      usage: {
        inputTokens: usage?.prompt_tokens ?? 0,
        outputTokens: usage?.completion_tokens ?? 0,
      },
    }
  }
}

/**
 * AnthropicLLMClient — dùng Anthropic Claude làm LLM backend.
 * Dùng fetch trực tiếp để tránh thêm dependency.
 */
export class AnthropicLLMClient implements LLMClient {
  private readonly apiKey: string
  private readonly model: string

  constructor(options: { apiKey: string; model?: string }) {
    this.apiKey = options.apiKey
    this.model = options.model ?? "claude-sonnet-4-5"
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const systemMessage = request.messages.find((m) => m.role === "system")
    const userMessages = request.messages.filter((m) => m.role !== "system")

    const body = {
      model: this.model,
      max_tokens: request.maxTokens ?? 1000,
      ...(systemMessage !== undefined && { system: systemMessage.content }),
      messages: userMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      throw new Error(`Anthropic API error: ${res.status} ${await res.text()}`)
    }

    const data = await res.json() as {
      content: Array<{ type: string; text?: string }>
      usage: { input_tokens: number; output_tokens: number }
    }

    const content = data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("")

    return {
      content,
      usage: {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
      },
    }
  }
}

/**
 * GoogleLLMClient — dùng Google Gemini API.
 * Hỗ trợ hệ thống message thông qua system_instruction (Gemini 1.5+).
 */
export class GoogleLLMClient implements LLMClient {
  private readonly apiKey: string
  private readonly model: string

  constructor(options: { apiKey: string; model?: string }) {
    this.apiKey = options.apiKey
    this.model = options.model ?? "gemini-1.5-flash"
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const systemMessage = request.messages.find((m) => m.role === "system")
    const userMessages = request.messages.filter((m) => m.role !== "system")

    const body = {
      contents: userMessages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      ...(systemMessage !== undefined && {
        system_instruction: {
          parts: [{ text: systemMessage.content }],
        },
      }),
      generationConfig: {
        maxOutputTokens: request.maxTokens ?? 1000,
        temperature: request.temperature ?? 0.1,
      },
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      throw new Error(`Google Gemini API error: ${res.status} ${await res.text()}`)
    }

    const data = await res.json() as {
      candidates: Array<{
        content: { parts: Array<{ text: string }> }
      }>
      usageMetadata: { promptTokenCount: number; candidatesTokenCount: number }
    }

    const content = data.candidates[0]?.content?.parts?.[0]?.text ?? ""

    return {
      content,
      usage: {
        inputTokens: data.usageMetadata.promptTokenCount,
        outputTokens: data.usageMetadata.candidatesTokenCount,
      },
    }
  }
}

