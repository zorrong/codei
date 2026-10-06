import { describe, expect, it } from "vitest"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { TraversalCache } from "../src/retrieval/TraversalCache.js"
import { ContextBuilder } from "../src/retrieval/ContextBuilder.js"
import { Retriever } from "../src/retrieval/Retriever.js"
import { DEFAULT_RETRIEVAL_CONFIG } from "../src/types/Retrieval.js"
import type { FileNode, IndexTree, SymbolNode } from "../src/types/TreeNode.js"
import type { LLMClient } from "../src/types/LLMClient.js"

function makeTree(): IndexTree {
  const sym: SymbolNode = {
    nodeId: "sym:a.ts:Foo",
    title: "Foo",
    level: "symbol",
    shortSummary: "Foo class",
    filePath: "a.ts",
    signature: "class Foo",
    fullSource: "class Foo {\n  // comment line\n\n  bar() { return 1 }\n}",
    startLine: 1,
    endLine: 5,
    kind: "class",
    isExported: true,
    internalRefs: [],
    children: [],
    parentId: "file:a.ts",
  }
  const file: FileNode = {
    nodeId: "file:a.ts",
    title: "a.ts",
    level: "file",
    shortSummary: "a file",
    filePath: "a.ts",
    gitHash: "x",
    indexedAt: 1,
    exports: ["Foo"],
    internalDeps: [],
    externalDeps: [],
    children: [sym.nodeId],
  }
  const root = {
    nodeId: "project:root",
    title: "root",
    level: "project" as const,
    shortSummary: "root",
    rootPath: "/",
    primaryLanguage: "typescript",
    children: [file.nodeId],
  }
  return {
    root,
    version: "1",
    builtAt: 1,
    nodes: { [root.nodeId]: root, [file.nodeId]: file, [sym.nodeId]: sym },
  }
}

describe("TraversalCache P1-7", () => {
  it("persist chỉ nodeId, đọc được format cũ", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codei-cache-"))
    const cachePath = path.join(dir, "traversal-cache.json")
    const tree = makeTree()

    const cache = new TraversalCache({ persistencePath: cachePath })
    cache.set("foo query", {
      selectedFiles: [tree.nodes["file:a.ts"] as FileNode],
      selectedSymbols: [tree.nodes["sym:a.ts:Foo"] as SymbolNode],
      path: ["symbols: [sym:a.ts:Foo]"],
      symbolScores: { "sym:a.ts:Foo": 1 },
    })
    cache.flushSync()

    const raw = fs.readFileSync(cachePath, "utf-8")
    // Không lưu fullSource trong file cache
    expect(raw).not.toContain("bar() { return 1 }")
    expect(raw).not.toContain("\n  ")
    const parsed = JSON.parse(raw)
    expect(parsed.entries[0].result.symbolIds).toEqual(["sym:a.ts:Foo"])
    expect(parsed.entries[0].result.fileIds).toEqual(["file:a.ts"])

    // Load lại từ đĩa và resolve qua tree
    const cache2 = new TraversalCache({ persistencePath: cachePath })
    const hit = cache2.get("foo query", tree)
    expect(hit?.selectedSymbols.map((s) => s.nodeId)).toEqual(["sym:a.ts:Foo"])
    expect(hit?.symbolScores?.["sym:a.ts:Foo"]).toBe(1)

    // Id không còn trong tree mới → coi như miss
    const emptyTree: IndexTree = { root: tree.root, version: "1", builtAt: 2, nodes: {} }
    expect(cache2.get("foo query", emptyTree)).toBeNull()

    // Format cũ (full nodes) vẫn đọc được
    const legacyPath = path.join(dir, "legacy.json")
    fs.writeFileSync(
      legacyPath,
      JSON.stringify({
        cacheKey: "",
        entries: [
          {
            originalQuery: "foo query",
            result: {
              selectedFiles: [tree.nodes["file:a.ts"]],
              selectedSymbols: [tree.nodes["sym:a.ts:Foo"]],
              path: ["symbols: [x]"],
            },
            timestamp: Date.now(),
            hitCount: 0,
          },
        ],
      })
    )
    const cache3 = new TraversalCache({ persistencePath: legacyPath })
    expect(cache3.get("foo query", tree)?.selectedSymbols.length).toBe(1)
  })

  it("invalidateByIds chỉ xoá entry liên quan (P2-15)", () => {
    const tree = makeTree()
    const cache = new TraversalCache()
    cache.set("foo query", {
      selectedFiles: [tree.nodes["file:a.ts"] as FileNode],
      selectedSymbols: [tree.nodes["sym:a.ts:Foo"] as SymbolNode],
      path: [],
    })
    cache.set("other query xyz", {
      selectedFiles: [tree.nodes["file:a.ts"] as FileNode],
      selectedSymbols: [tree.nodes["sym:a.ts:Foo"] as SymbolNode],
      path: [],
    })
    // "other query xyz" hash khác "foo query" (sort words) — xoá theo id file
    const removed = cache.invalidateByIds(new Set(["file:a.ts"]))
    expect(removed).toBe(2)
    expect(cache.get("foo query", tree)).toBeNull()
  })
})

describe("ContextBuilder P2-13 compact", () => {
  it("bỏ dòng trống và comment", () => {
    const builder = new ContextBuilder()
    const out = builder.compactSource("line1\n\n// comment\n  # hash\ncode();\n/* block */\nline2")
    expect(out).toBe("line1\ncode();\nline2")
  })

  it("build với compact giảm token", () => {
    const builder = new ContextBuilder()
    const tree = makeTree()
    const sym = tree.nodes["sym:a.ts:Foo"] as SymbolNode
    const file = tree.nodes["file:a.ts"] as FileNode
    const full = builder.build({ selectedSymbols: [sym], selectedFiles: [file], deps: [], config: DEFAULT_RETRIEVAL_CONFIG })
    const compact = builder.build({
      selectedSymbols: [sym],
      selectedFiles: [file],
      deps: [],
      config: { ...DEFAULT_RETRIEVAL_CONFIG, compact: true },
    })
    expect(compact.estimatedTokens).toBeLessThan(full.estimatedTokens)
    expect(compact.context).not.toContain("// comment line")
  })
})

describe("Retriever P2-12 rawTokens", () => {
  it("trả rawTokens và savedPct", async () => {
    const tree = makeTree()
    const llm: LLMClient = {
      async complete() {
        return { content: JSON.stringify({ s: ["sym:a.ts:Foo"] }), usage: { inputTokens: 1, outputTokens: 1 } }
      },
    }
    const retriever = new Retriever({ llmClient: llm })
    const result = await retriever.retrieve(tree, { query: "Foo" })
    expect(result.rawTokens).toBeGreaterThan(0)
    expect(result.savedPct).toBeGreaterThanOrEqual(0)
    expect(result.savedPct).toBeLessThanOrEqual(100)
  })
})
