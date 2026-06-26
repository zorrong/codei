/**
 * SummaryGenerator — dùng LLM để generate summaries cho tree nodes.
 * Chỉ feed signatures + JSDoc, KHÔNG feed full source để tiết kiệm token.
 */

import type { LLMClient } from "../types/LLMClient.js"
import type { ParsedFile, RawSymbol } from "../types/RawSymbol.js"

export type SummaryMode = "llm" | "heuristic" | "auto"

export interface FileSummaryResult {
  relativePath: string
  shortSummary: string
  detailedSummary: string
}

export interface ModuleSummaryResult {
  dirPath: string
  shortSummary: string
}

export interface SummaryCacheEntry {
  gitHash: string
  shortSummary: string
  detailedSummary: string
  updatedAt: number
}

export type SummaryCache = Record<string, SummaryCacheEntry>

export class SummaryGenerator {
  private mode: SummaryMode

  constructor(
    private readonly llm: LLMClient,
    options: { mode?: SummaryMode } = {}
  ) {
    this.mode = options.mode ?? "auto"
  }

  setMode(mode: SummaryMode): void {
    this.mode = mode
  }

  async generateFileSummary(file: ParsedFile): Promise<FileSummaryResult> {
    if (this.mode === "heuristic") {
      return {
        relativePath: file.relativePath,
        shortSummary: this.heuristicShortSummary(file),
        detailedSummary: this.heuristicDetailedSummary(file),
      }
    }

    try {
      return await this.generateFileSummaryLLM(file)
    } catch {
      return {
        relativePath: file.relativePath,
        shortSummary: this.heuristicShortSummary(file),
        detailedSummary: this.heuristicDetailedSummary(file),
      }
    }
  }

  /**
   * Generate summary cho một file từ symbols của nó.
   * Feed chỉ signatures + docComments — không feed full source.
   */
  private async generateFileSummaryLLM(file: ParsedFile): Promise<FileSummaryResult> {
    const signaturesText = this.buildSignaturesText(file.symbols)
    const exportsList = file.exports.join(", ")

    const prompt = `You are analyzing a source file to create a concise index entry.

File: ${file.relativePath}
Language: ${file.language}
Exports: ${exportsList || "none"}

Symbols (signatures only):
${signaturesText}

Respond with ONLY a JSON object in this exact format, no markdown:
{
  "short": "1-2 sentence summary of what this file does",
  "detailed": "3-5 sentence summary covering main responsibilities, key exports, and notable patterns"
}`

    const response = await this.llm.complete({
      messages: [{ role: "user", content: prompt }],
      maxTokens: 300,
      temperature: 0.1,
      requestLabel: `summary:file:${file.relativePath}`,
    })

    const parsed = this.parseJsonResponse(response.content, {
      short: this.heuristicShortSummary(file),
      detailed: this.heuristicDetailedSummary(file),
    })

    return {
      relativePath: file.relativePath,
      shortSummary: parsed.short as string,
      detailedSummary: parsed.detailed as string,
    }
  }

  private heuristicShortSummary(file: ParsedFile): string {
    const exported = file.symbols.filter((s) => s.isExported).map((s) => s.name)
    const top = (exported.length > 0 ? exported : file.symbols.map((s) => s.name)).slice(0, 5)
    const suffix = top.length > 0 ? ` (${top.join(", ")})` : ""
    return `${file.relativePath} — ${file.language} file with ${file.symbols.length} symbols${suffix}`
  }

  private heuristicDetailedSummary(file: ParsedFile): string {
    const kinds = new Map<string, number>()
    for (const s of file.symbols) {
      kinds.set(s.kind, (kinds.get(s.kind) ?? 0) + 1)
    }
    const kindText = Array.from(kinds.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k, v]) => `${k}:${v}`)
      .join(", ")

    const exportsList = file.exports.slice(0, 12).join(", ")
    const internalDeps = file.internalImports.length
    const externalDeps = file.externalImports.length

    const parts = [
      `Exports: ${exportsList || "none"}`,
      `Deps: internal ${internalDeps}, external ${externalDeps}`,
      kindText ? `Symbols: ${kindText}` : "",
    ].filter(Boolean)

    return parts.join(". ")
  }

  /**
   * Batch generate summaries cho nhiều files.
   * Gọi LLM song song với concurrency limit.
   */
  async generateFileSummaries(
    files: ParsedFile[],
    concurrency = 5,
    options: {
      cache?: SummaryCache | undefined
      getHash?: ((file: ParsedFile) => string) | undefined
    } = {}
  ): Promise<Map<string, FileSummaryResult>> {
    const results = new Map<string, FileSummaryResult>()
    const cache = options.cache
    const getHash = options.getHash

    // Process theo batch để tránh rate limit
    for (let i = 0; i < files.length; i += concurrency) {
      const batch = files.slice(i, i + concurrency)
      const batchResults = await Promise.all(
        batch.map(async (file) => {
          try {
            const gitHash = getHash ? getHash(file) : ""
            const cached = cache?.[file.relativePath]
            if (cached && cached.gitHash === gitHash && cached.shortSummary && cached.detailedSummary) {
              return {
                relativePath: file.relativePath,
                shortSummary: cached.shortSummary,
                detailedSummary: cached.detailedSummary,
              }
            }

            if (this.mode === "heuristic") {
              const result = {
                relativePath: file.relativePath,
                shortSummary: this.heuristicShortSummary(file),
                detailedSummary: this.heuristicDetailedSummary(file),
              }
              if (cache && gitHash) {
                cache[file.relativePath] = {
                  gitHash,
                  shortSummary: result.shortSummary,
                  detailedSummary: result.detailedSummary,
                  updatedAt: Date.now(),
                }
              }
              return result
            }

            const llmResult = await this.generateFileSummaryLLM(file)
            if (cache && gitHash) {
              cache[file.relativePath] = {
                gitHash,
                shortSummary: llmResult.shortSummary,
                detailedSummary: llmResult.detailedSummary,
                updatedAt: Date.now(),
              }
            }
            return llmResult
          } catch {
            const fallback = {
              relativePath: file.relativePath,
              shortSummary: this.heuristicShortSummary(file),
              detailedSummary: this.heuristicDetailedSummary(file),
            }
            const gitHash = getHash ? getHash(file) : ""
            if (cache && gitHash) {
              cache[file.relativePath] = {
                gitHash,
                shortSummary: fallback.shortSummary,
                detailedSummary: fallback.detailedSummary,
                updatedAt: Date.now(),
              }
            }
            return fallback
          }
        })
      )
      for (const result of batchResults) {
        results.set(result.relativePath, result)
      }
    }

    return results
  }

  /**
   * Generate summary cho một module (directory) từ file summaries của nó.
   */
  async generateModuleSummary(
    dirPath: string,
    fileSummaries: FileSummaryResult[]
  ): Promise<ModuleSummaryResult> {
    if (fileSummaries.length === 0) {
      return { dirPath, shortSummary: `Module at ${dirPath}` }
    }

    if (this.mode === "heuristic") {
      const sample = fileSummaries
        .map((f) => f.shortSummary)
        .filter(Boolean)
        .slice(0, 6)
        .join("; ")

      const suffix = sample ? ` — ${sample}` : ""
      return { dirPath, shortSummary: `${dirPath} — ${fileSummaries.length} files${suffix}` }
    }

    const fileList = fileSummaries
      .map((f) => `- ${f.relativePath}: ${f.shortSummary}`)
      .join("\n")

    const prompt = `Summarize this code module (directory) in 1-2 sentences based on its files.

Module: ${dirPath}
Files:
${fileList}

Respond with ONLY a JSON object, no markdown:
{"short": "1-2 sentence summary of what this module does"}`

    const response = await this.llm.complete({
      messages: [{ role: "user", content: prompt }],
      maxTokens: 150,
      temperature: 0.1,
      requestLabel: `summary:module:${dirPath}`,
    })

    const parsed = this.parseJsonResponse(response.content, {
      short: `Module: ${dirPath}`,
    })

    return {
      dirPath,
      shortSummary: parsed.short as string,
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private buildSignaturesText(symbols: RawSymbol[]): string {
    return symbols
      .map((s) => {
        let line = s.signature
        if (s.docComment) line += `  // ${s.docComment.split("\n")[0]}`
        return line
      })
      .join("\n")
  }

  private parseJsonResponse(
    content: string,
    fallback: Record<string, unknown>
  ): Record<string, unknown> {
    try {
      const cleaned = content.replace(/```json|```/g, "").trim()
      return JSON.parse(cleaned) as Record<string, unknown>
    } catch {
      return fallback
    }
  }
}
