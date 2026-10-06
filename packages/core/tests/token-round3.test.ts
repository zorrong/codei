import { describe, expect, it } from "vitest"
import { ContextBuilder } from "../src/retrieval/ContextBuilder.js"
import type { FileNode, SymbolNode } from "../src/types/TreeNode.js"
import { DEFAULT_RETRIEVAL_CONFIG } from "../src/types/Retrieval.js"

let seq = 0

function mkSym(
  name: string,
  file: string,
  source: string,
  opts: { kind?: string; start?: number; end?: number; summary?: string } = {}
): SymbolNode {
  const lines = source.split("\n").length
  return {
    nodeId: `sym:${file}:${name}#${seq++}`,
    title: name,
    level: "symbol",
    shortSummary: opts.summary ?? `${name} summary`,
    filePath: file,
    signature: `${opts.kind ?? "function"} ${name}`,
    fullSource: source,
    startLine: opts.start ?? 1,
    endLine: opts.end ?? lines,
    kind: opts.kind ?? "function",
    isExported: true,
    internalRefs: [],
    children: [],
    parentId: `file:${file}`,
  }
}

function mkFile(file: string, syms: SymbolNode[], summary = "UNIQUE_FILE_SUMMARY_XYZ"): FileNode {
  return {
    nodeId: `file:${file}`,
    title: file,
    level: "file",
    shortSummary: summary,
    filePath: file,
    gitHash: "x",
    indexedAt: 1,
    exports: [],
    internalDeps: [],
    externalDeps: [],
    children: syms.map((s) => s.nodeId),
    parentId: "project:root",
  }
}

function scoresFor(syms: SymbolNode[], scores: number[]): Record<string, number> {
  const out: Record<string, number> = {}
  syms.forEach((s, i) => {
    out[s.nodeId] = scores[i] ?? 1
  })
  return out
}

const CLASS_SRC = `class AuthService {
  login() { return MARKER_LOGIN_123 }
}`
const METHOD_SRC = `login() { return MARKER_LOGIN_123 }`

describe("Vòng 3-1: dedup symbol lồng nhau", () => {
  it("bỏ method khi class chứa nó render full (cả 2 thứ tự score)", () => {
    const builder = new ContextBuilder()
    for (const [clsScore, mScore] of [[1, 0.9], [0.9, 1]] as const) {
      const cls = mkSym("AuthService", "a.ts", CLASS_SRC, { kind: "class", start: 1, end: 3 })
      const method = mkSym("login", "a.ts", METHOD_SRC, { kind: "method", start: 2, end: 2 })
      const file = mkFile("a.ts", [cls, method])
      const { context } = builder.build({
        selectedSymbols: [cls, method],
        selectedFiles: [file],
        deps: [],
        config: DEFAULT_RETRIEVAL_CONFIG,
        symbolScores: scoresFor([cls, method], [clsScore, mScore]),
      })
      // marker chỉ xuất hiện 1 lần (trong class), không in trùng ở block method
      expect(context.match(/MARKER_LOGIN_123/g)?.length).toBe(1)
      expect(context).toContain("omitted")
    }
  })

  it("giữ method khi class quá lớn bị truncate", () => {
    const builder = new ContextBuilder()
    const bigBody = ["class Big {"]
    for (let i = 0; i < 200; i++) bigBody.push(`  m${i}() { return MARKER_PAD_${i} } // padding padding pad`)
    bigBody.push("  target() { return MARKER_TARGET_456 }")
    bigBody.push("}")
    const cls = mkSym("Big", "b.ts", bigBody.join("\n"), { kind: "class", start: 1, end: 203 })
    const method = mkSym("target", "b.ts", `target() { return MARKER_TARGET_456 }`, {
      kind: "method",
      start: 201,
      end: 201,
    })
    const file = mkFile("b.ts", [cls, method])
    const { context } = builder.build({
      selectedSymbols: [cls, method],
      selectedFiles: [file],
      deps: [],
      config: DEFAULT_RETRIEVAL_CONFIG,
      symbolScores: scoresFor([cls, method], [1, 0.9]),
    })
    expect(context).toContain("lines omitted") // class bị truncate
    expect(context).toContain("MARKER_TARGET_456") // method vẫn giữ full
  })

  it("không dedup symbol khác file dù trùng line range", () => {
    const builder = new ContextBuilder()
    const s1 = mkSym("one", "a.ts", "function one() { return MARKER_ONE_111 }", { start: 1, end: 3 })
    const s2 = mkSym("two", "b.ts", "function two() { return MARKER_TWO_222 }", { start: 1, end: 3 })
    const { context } = builder.build({
      selectedSymbols: [s1, s2],
      selectedFiles: [mkFile("a.ts", [s1]), mkFile("b.ts", [s2])],
      deps: [],
      config: DEFAULT_RETRIEVAL_CONFIG,
      symbolScores: scoresFor([s1, s2], [1, 0.9]),
    })
    expect(context).toContain("MARKER_ONE_111")
    expect(context).toContain("MARKER_TWO_222")
    expect(context).not.toContain("omitted")
  })
})

describe("Vòng 3-2: render theo hạng điểm", () => {
  it("top-3 full body, từ hạng 4 chỉ signature", () => {
    const builder = new ContextBuilder()
    const syms = Array.from({ length: 5 }, (_, i) =>
      mkSym(`fn${i}`, "a.ts", `function fn${i}() { return MARKER_BODY_${i} }`, {
        summary: `fn${i} summary`,
      })
    )
    // signature chứa tên nhưng không chứa marker body
    for (const s of syms) s.signature = `function ${s.title}()`
    const file = mkFile("a.ts", syms)
    const { context } = builder.build({
      selectedSymbols: syms,
      selectedFiles: [file],
      deps: [],
      config: DEFAULT_RETRIEVAL_CONFIG,
      symbolScores: scoresFor(syms, [1, 0.9, 0.8, 0.7, 0.6]),
    })
    for (const i of [0, 1, 2]) expect(context).toContain(`MARKER_BODY_${i}`)
    for (const i of [3, 4]) {
      expect(context).not.toContain(`MARKER_BODY_${i}`)
      expect(context).toContain(`function fn${i}()`) // signature vẫn có + location
    }
    expect(context).toContain("a.ts:L1-L1")
  })
})

describe("Vòng 3-3: cắt theo khoảng cách điểm", () => {
  it("bỏ symbol <30% max score, luôn giữ top-1", () => {
    const builder = new ContextBuilder()
    const top = mkSym("top", "a.ts", "function top() { return MARKER_TOP_999 }")
    const mid = mkSym("mid", "a.ts", "function mid() { return MARKER_MID_888 }")
    const low = mkSym("low", "a.ts", "function low() { return MARKER_LOW_777 }")
    const file = mkFile("a.ts", [top, mid, low])
    const { context } = builder.build({
      selectedSymbols: [top, mid, low],
      selectedFiles: [file],
      deps: [],
      config: DEFAULT_RETRIEVAL_CONFIG,
      symbolScores: scoresFor([top, mid, low], [1, 0.9, 0.2]),
    })
    expect(context).toContain("MARKER_TOP_999")
    expect(context).toContain("MARKER_MID_888")
    expect(context).not.toContain("MARKER_LOW_777")
    expect(context).toContain("omitted")
  })
})

describe("Vòng 3-5: bỏ summary cấp file", () => {
  it("header chỉ còn === path ===, giữ comment cấp symbol", () => {
    const builder = new ContextBuilder()
    const s = mkSym("one", "a.ts", "function one() { return 1 }", { summary: "does one thing" })
    const { context } = builder.build({
      selectedSymbols: [s],
      selectedFiles: [mkFile("a.ts", [s])],
      deps: [],
      config: DEFAULT_RETRIEVAL_CONFIG,
    })
    expect(context).toContain("=== a.ts ===")
    expect(context).not.toContain("UNIQUE_FILE_SUMMARY_XYZ")
    expect(context).toContain("// does one thing")
  })
})

describe("Vòng 3-4: alreadySent render tham chiếu", () => {
  it("symbol đã gửi chỉ còn 1 dòng tham chiếu", () => {
    const builder = new ContextBuilder()
    const s1 = mkSym("sent", "a.ts", "function sent() { return MARKER_SENT_555 }", { start: 10, end: 12 })
    const s2 = mkSym("fresh", "a.ts", "function fresh() { return MARKER_FRESH_444 }")
    const file = mkFile("a.ts", [s1, s2])
    const { context, estimatedTokens } = builder.build({
      selectedSymbols: [s1, s2],
      selectedFiles: [file],
      deps: [],
      config: { ...DEFAULT_RETRIEVAL_CONFIG, alreadySentNodeIds: [s1.nodeId] },
      symbolScores: scoresFor([s1, s2], [1, 0.9]),
    })
    expect(context).not.toContain("MARKER_SENT_555")
    expect(context).toContain("already sent (a.ts:L10-L12)")
    expect(context).toContain("MARKER_FRESH_444")
    expect(estimatedTokens).toBeLessThan(100)
  })
})
