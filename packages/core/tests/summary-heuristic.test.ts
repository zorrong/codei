import { describe, expect, it } from "vitest"
import { SummaryGenerator } from "../src/llm/SummaryGenerator.js"
import type { LLMClient } from "../src/types/LLMClient.js"
import type { ParsedFile } from "../src/types/RawSymbol.js"

const noopLlm: LLMClient = {
  async complete() {
    throw new Error("LLM disabled")
  },
}

function makeFile(symbols: ParsedFile["symbols"]): ParsedFile {
  return {
    filePath: "/proj/src/auth.ts",
    relativePath: "src/auth.ts",
    language: "typescript",
    symbols,
    internalImports: [],
    externalImports: [],
    exports: symbols.filter((s) => s.isExported).map((s) => s.name),
  }
}

function makeSym(name: string, docComment?: string) {
  return {
    name,
    kind: "class" as const,
    signature: `class ${name}`,
    startLine: 1,
    endLine: 5,
    fullSource: `class ${name} {}`,
    isExported: true,
    ...(docComment !== undefined && { docComment }),
  }
}

describe("SummaryGenerator heuristic (mục 1)", () => {
  it("đưa doc comment đầu tiên vào short summary", async () => {
    const gen = new SummaryGenerator(noopLlm, { mode: "heuristic" })
    const res = await gen.generateFileSummary(
      makeFile([makeSym("AuthService", "/** Handles JWT authentication. */")])
    )
    expect(res.shortSummary).toContain("Handles JWT authentication.")
    expect(res.shortSummary).toContain("AuthService")
  })

  it("cắt doc quá dài và bỏ qua khi không có doc", async () => {
    const gen = new SummaryGenerator(noopLlm, { mode: "heuristic" })
    const long = "x".repeat(500)
    const withLong = await gen.generateFileSummary(makeFile([makeSym("A", long)]))
    expect(withLong.shortSummary.length).toBeLessThan(300)

    const noDoc = await gen.generateFileSummary(makeFile([makeSym("B")]))
    expect(noDoc.shortSummary).toContain("src/auth.ts")
    expect(noDoc.shortSummary).toContain("B")
  })
})
