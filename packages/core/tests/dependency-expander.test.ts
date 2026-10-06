import { describe, expect, it } from "vitest"
import { DependencyExpander } from "../src/retrieval/DependencyExpander.js"
import type { FileNode, IndexTree, SymbolNode } from "../src/types/TreeNode.js"

function makeTree(): IndexTree {
  const mainSym: SymbolNode = {
    nodeId: "sym:src/main.ts:Main",
    title: "Main",
    level: "symbol",
    shortSummary: "Uses A only",
    filePath: "src/main.ts",
    signature: "class Main",
    fullSource: "class Main {\n  run(a: A) { return a.go() }\n}",
    startLine: 1,
    endLine: 3,
    kind: "class",
    isExported: true,
    internalRefs: ["src/deps.ts"],
    children: [],
    parentId: "file:src/main.ts",
  }
  const symA: SymbolNode = {
    nodeId: "sym:src/deps.ts:A",
    title: "A",
    level: "symbol",
    shortSummary: "A",
    filePath: "src/deps.ts",
    signature: "class A",
    fullSource: "class A { go() {} }",
    startLine: 1,
    endLine: 1,
    kind: "class",
    isExported: true,
    internalRefs: [],
    children: [],
    parentId: "file:src/deps.ts",
  }
  const symB: SymbolNode = {
    nodeId: "sym:src/deps.ts:B",
    title: "B",
    level: "symbol",
    shortSummary: "B unused",
    filePath: "src/deps.ts",
    signature: "class B",
    fullSource: "class B { other() {} }",
    startLine: 2,
    endLine: 2,
    kind: "class",
    isExported: true,
    internalRefs: [],
    children: [],
    parentId: "file:src/deps.ts",
  }
  const symUser: SymbolNode = {
    nodeId: "sym:src/deps.ts:User",
    title: "User",
    level: "symbol",
    shortSummary: "User",
    filePath: "src/deps.ts",
    signature: "class User",
    fullSource: "class User {}",
    startLine: 3,
    endLine: 3,
    kind: "class",
    isExported: true,
    internalRefs: [],
    children: [],
    parentId: "file:src/deps.ts",
  }
  const mainFile: FileNode = {
    nodeId: "file:src/main.ts",
    title: "main.ts",
    level: "file",
    shortSummary: "main",
    filePath: "src/main.ts",
    gitHash: "a",
    indexedAt: 1,
    exports: ["Main"],
    internalDeps: ["src/deps.ts"],
    externalDeps: [],
    children: [mainSym.nodeId],
    parentId: "project:root",
  }
  const depFile: FileNode = {
    nodeId: "file:src/deps.ts",
    title: "deps.ts",
    level: "file",
    shortSummary: "deps",
    filePath: "src/deps.ts",
    gitHash: "b",
    indexedAt: 1,
    exports: ["A", "B", "User"],
    internalDeps: [],
    externalDeps: [],
    children: [symA.nodeId, symB.nodeId, symUser.nodeId],
  }
  const root = {
    nodeId: "project:root",
    title: "root",
    level: "project" as const,
    shortSummary: "root",
    rootPath: "/",
    primaryLanguage: "typescript",
    children: [mainFile.nodeId, depFile.nodeId],
  }
  return {
    root,
    version: "1",
    builtAt: 1,
    nodes: {
      [root.nodeId]: root,
      [mainFile.nodeId]: mainFile,
      [depFile.nodeId]: depFile,
      [mainSym.nodeId]: mainSym,
      [symA.nodeId]: symA,
      [symB.nodeId]: symB,
      [symUser.nodeId]: symUser,
    },
  }
}

describe("DependencyExpander P0-1", () => {
  it("chỉ giữ dep có tên được dùng, bỏ symbol không dùng", () => {
    const tree = makeTree()
    const expander = new DependencyExpander()
    const main = tree.nodes["sym:src/main.ts:Main"] as SymbolNode
    const deps = expander.expand(tree, [main], new Set([main.nodeId]))
    const titles = deps.map((d) => d.symbol.title)
    expect(titles).toContain("A")
    expect(titles).not.toContain("B")
  })

  it("không match nhầm substring (User vs UserService)", () => {
    const tree = makeTree()
    const expander = new DependencyExpander()
    const mainWithUserService: SymbolNode = {
      ...(tree.nodes["sym:src/main.ts:Main"] as SymbolNode),
      fullSource: "class Main { run(s: UserService) {} }",
    }
    const deps = expander.expand(tree, [mainWithUserService], new Set([mainWithUserService.nodeId]))
    const titles = deps.map((d) => d.symbol.title)
    // "User" không phải từ độc lập trong "UserService" theo \b? Thực tế "User" + "Service" dính nhau nên \b không match
    expect(titles).not.toContain("User")
    expect(titles).not.toContain("A")
  })
})
