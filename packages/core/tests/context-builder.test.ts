import { describe, expect, it } from "vitest"
import { ContextBuilder, MAX_SYMBOL_TOKENS } from "../src/retrieval/ContextBuilder.js"
import { TraversalReasoner, MAX_LLM_CANDIDATES } from "../src/llm/TraversalReasoner.js"
import type { LLMClient } from "../src/types/LLMClient.js"
import type { FileNode, SymbolNode } from "../src/types/TreeNode.js"
import { DEFAULT_RETRIEVAL_CONFIG } from "../src/types/Retrieval.js"

function makeSym(id: string, file: string, source: string, kind = "function"): SymbolNode {
  return {
    nodeId: id,
    title: id.split(":").pop() ?? id,
    level: "symbol",
    shortSummary: `summary ${id}`,
    filePath: file,
    signature: `${kind} ${id}`,
    fullSource: source,
    startLine: 1,
    endLine: source.split("\n").length,
    kind,
    isExported: true,
    internalRefs: [],
    children: [],
    parentId: `file:${file}`,
  }
}

function makeFile(file: string, children: string[]): FileNode {
  return {
    nodeId: `file:${file}`,
    title: file,
    level: "file",
    shortSummary: `file ${file}`,
    filePath: file,
    gitHash: "x",
    indexedAt: 1,
    exports: [],
    internalDeps: [],
    externalDeps: [],
    children,
    parentId: "project:root",
  }
}

describe("ContextBuilder P0-2", () => {
  it("bỏ dep trước, giữ direct; không cắt giữa code", () => {
    const builder = new ContextBuilder()
    const s1 = makeSym("sym:a.ts:one", "a.ts", "function one() { return 1 }")
    const s2 = makeSym("sym:a.ts:two", "a.ts", "function two() { return 2 }")
    const file = makeFile("a.ts", [s1.nodeId, s2.nodeId])
    const depSym = makeSym("sym:b.ts:dep", "b.ts", "class Dep {}")
    const depFile = makeFile("b.ts", [depSym.nodeId])

    const { context } = builder.build({
      selectedSymbols: [s1, s2],
      selectedFiles: [file],
      deps: [{ symbol: depSym, fileNode: depFile, signatureOnly: "class Dep" }],
      config: { ...DEFAULT_RETRIEVAL_CONFIG, maxOutputTokens: 30 },
      symbolScores: { [s1.nodeId]: 1, [s2.nodeId]: 0.2 },
    })

    expect(context).toContain("omitted")
    // dep bị bỏ trước nên không có "Dependencies" khi quá limit nặng
    // direct điểm cao (s1) phải còn nguyên
    expect(context).toContain("function one() { return 1 }")
  })

  it("header file chỉ in khi còn symbol", () => {
    const builder = new ContextBuilder()
    const s1 = makeSym("sym:a.ts:one", "a.ts", "function one() { return 1 }")
    const s2 = makeSym("sym:gone.ts:two", "gone.ts", "function two() { return 2 }")
    const fileA = makeFile("a.ts", [s1.nodeId])
    const fileGone = makeFile("gone.ts", [s2.nodeId])

    const { context } = builder.build({
      selectedSymbols: [s1, s2],
      selectedFiles: [fileA, fileGone],
      deps: [],
      config: { ...DEFAULT_RETRIEVAL_CONFIG, maxOutputTokens: 25 },
      symbolScores: { [s1.nodeId]: 1, [s2.nodeId]: 0.1 },
    })

    expect(context).toContain("=== a.ts ===")
    expect(context).not.toContain("=== gone.ts ===")
  })
})

describe("ContextBuilder P0-4", () => {
  it("class lớn chỉ in signature + methods, kèm vị trí dòng", () => {
    const builder = new ContextBuilder()
    const bigBody = ["class Big {"]
    for (let i = 0; i < 200; i++) bigBody.push(`  method${i}() { return ${i} } // padding padding padding padding`)
    bigBody.push("}")
    const big = makeSym("sym:big.ts:Big", "big.ts", bigBody.join("\n"), "class")
    big.startLine = 10
    big.endLine = 220
    const file = makeFile("big.ts", [big.nodeId])

    const { context, estimatedTokens } = builder.build({
      selectedSymbols: [big],
      selectedFiles: [file],
      deps: [],
      config: DEFAULT_RETRIEVAL_CONFIG,
    })

    expect(estimatedTokens).toBeLessThanOrEqual(MAX_SYMBOL_TOKENS + 50)
    expect(context).toContain("lines omitted")
    expect(context).toContain("big.ts:L10-L220")
  })
})

describe("TraversalReasoner P0-3 + P0-5 + P2-14", () => {
  const recordingLlm: LLMClient & { lastPrompt: string } = {
    lastPrompt: "",
    async complete(req) {
      this.lastPrompt = req.messages.map((m) => m.content).join("\n")
      return { content: JSON.stringify({ s: [] }), usage: { inputTokens: 1, outputTokens: 1 } }
    },
  }

  it("giới hạn ≤30 candidate gửi LLM", async () => {
    const reasoner = new TraversalReasoner(recordingLlm)
    const candidates = Array.from({ length: 500 }, (_, i) => ({
      nodeId: `file:src/file${i}.ts`,
      title: `file${i}.ts`,
      summary: `unrelated module ${i}`,
    }))
    await reasoner.selectNodes("xyz-no-match-query-123", candidates, "file", 5)
    const lines = recordingLlm.lastPrompt.split("\n").filter((l) => l.startsWith("["))
    expect(lines.length).toBeLessThanOrEqual(MAX_LLM_CANDIDATES)
  })

  it("hiểu key rút gọn 's' và trả scores 0-1", async () => {
    const llm: LLMClient = {
      async complete() {
        return { content: JSON.stringify({ s: ["id:a"] }), usage: { inputTokens: 1, outputTokens: 1 } }
      },
    }
    const reasoner = new TraversalReasoner(llm)
    const decision = await reasoner.selectNodes(
      "nothing matches this at all",
      [
        { nodeId: "id:a", title: "aaa", summary: "bbb" },
        { nodeId: "id:b", title: "ccc", summary: "ddd" },
      ],
      "file",
      2
    )
    expect(decision.selectedIds).toEqual(["id:a"])
    expect(decision.scores?.["id:a"]).toBeGreaterThanOrEqual(0)
    expect(decision.scores?.["id:a"]).toBeLessThanOrEqual(1)
  })
})
