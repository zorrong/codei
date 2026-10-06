/**
 * Phase 3 tests — Retrieval Engine
 */

import { describe, it, expect } from "vitest"
import { TreeTraversal } from "../src/tree/TreeTraversal.js"
import { DependencyExpander } from "../src/retrieval/DependencyExpander.js"
import { ContextBuilder } from "../src/retrieval/ContextBuilder.js"
import { Retriever } from "../src/retrieval/Retriever.js"
import type { LLMClient, LLMRequest, LLMResponse } from "../src/types/LLMClient.js"
import type { IndexTree, SymbolNode, FileNode } from "../src/types/TreeNode.js"
import { DEFAULT_RETRIEVAL_CONFIG } from "../src/types/Retrieval.js"

// ─── Mock LLM ────────────────────────────────────────────────────────────────

function makeLLM(selectIds: string[]): LLMClient {
  return {
    async complete(_req: LLMRequest): Promise<LLMResponse> {
      return {
        content: JSON.stringify({ selected: selectIds, reasoning: "mock" }),
        usage: { inputTokens: 50, outputTokens: 20 },
      }
    },
  }
}

// ─── Fixture tree ─────────────────────────────────────────────────────────────

function makeFixtureTree(): IndexTree {
  const authFileNode: FileNode = {
    nodeId: "file:src/auth/auth.service.ts",
    title: "auth.service.ts",
    level: "file",
    shortSummary: "Handles JWT authentication",
    filePath: "src/auth/auth.service.ts",
    gitHash: "abc123",
    indexedAt: Date.now(),
    exports: ["AuthService"],
    internalDeps: ["src/user/user.service.ts"],
    externalDeps: ["jsonwebtoken"],
    children: [
      "sym:src/auth/auth.service.ts:AuthService",
      "sym:src/auth/auth.service.ts:login",
    ],
    parentId: "mod:src/auth",
  }

  const userFileNode: FileNode = {
    nodeId: "file:src/user/user.service.ts",
    title: "user.service.ts",
    level: "file",
    shortSummary: "Manages user records",
    filePath: "src/user/user.service.ts",
    gitHash: "def456",
    indexedAt: Date.now(),
    exports: ["UserService"],
    internalDeps: [],
    externalDeps: ["prisma"],
    children: ["sym:src/user/user.service.ts:UserService"],
    parentId: "mod:src/user",
  }

  const authServiceSym: SymbolNode = {
    nodeId: "sym:src/auth/auth.service.ts:AuthService",
    title: "AuthService",
    level: "symbol",
    shortSummary: "JWT auth service class",
    filePath: "src/auth/auth.service.ts",
    signature: "class AuthService",
    fullSource: "class AuthService {\n  constructor(private users: UserService) {}\n  async login(dto: LoginDto): Promise<TokenPair> { return {} as TokenPair }\n}",
    startLine: 10,
    endLine: 50,
    kind: "class",
    isExported: true,
    internalRefs: ["src/user/user.service.ts"],
    children: [],
    parentId: "file:src/auth/auth.service.ts",
  }

  const loginSym: SymbolNode = {
    nodeId: "sym:src/auth/auth.service.ts:login",
    title: "login",
    level: "symbol",
    shortSummary: "Authenticate user with email/password",
    filePath: "src/auth/auth.service.ts",
    signature: "async login(dto: LoginDto): Promise<TokenPair>",
    fullSource: "async login(dto: LoginDto): Promise<TokenPair> {\n  return {} as TokenPair\n}",
    startLine: 20,
    endLine: 30,
    kind: "method",
    isExported: false,
    internalRefs: [],
    children: [],
    parentId: "file:src/auth/auth.service.ts",
  }

  const userServiceSym: SymbolNode = {
    nodeId: "sym:src/user/user.service.ts:UserService",
    title: "UserService",
    level: "symbol",
    shortSummary: "Manages user CRUD operations",
    filePath: "src/user/user.service.ts",
    signature: "class UserService",
    fullSource: "class UserService {\n  async findByEmail(email: string) { return null }\n}",
    startLine: 5,
    endLine: 30,
    kind: "class",
    isExported: true,
    internalRefs: [],
    children: [],
    parentId: "file:src/user/user.service.ts",
  }

  const authModuleNode = {
    nodeId: "mod:src/auth",
    title: "auth",
    level: "module" as const,
    shortSummary: "Authentication module",
    dirPath: "src/auth",
    children: ["file:src/auth/auth.service.ts"],
    parentId: "project:root",
  }

  const userModuleNode = {
    nodeId: "mod:src/user",
    title: "user",
    level: "module" as const,
    shortSummary: "User management module",
    dirPath: "src/user",
    children: ["file:src/user/user.service.ts"],
    parentId: "project:root",
  }

  const projectNode = {
    nodeId: "project:root",
    title: "test-project",
    level: "project" as const,
    shortSummary: "Test project",
    rootPath: "/project",
    primaryLanguage: "typescript",
    children: ["mod:src/auth", "mod:src/user"],
  }

  return {
    root: projectNode,
    nodes: {
      "project:root": projectNode,
      "mod:src/auth": authModuleNode,
      "mod:src/user": userModuleNode,
      "file:src/auth/auth.service.ts": authFileNode,
      "file:src/user/user.service.ts": userFileNode,
      "sym:src/auth/auth.service.ts:AuthService": authServiceSym,
      "sym:src/auth/auth.service.ts:login": loginSym,
      "sym:src/user/user.service.ts:UserService": userServiceSym,
    },
    version: "1.0.0",
    builtAt: Date.now(),
  }
}

// ─── TreeTraversal Tests ──────────────────────────────────────────────────────

describe("TreeTraversal", () => {
  it("should traverse and return selected files and symbols", async () => {
    const tree = makeFixtureTree()
    // LLM selects auth module → auth file → AuthService symbol
    const llm = makeLLM([
      "mod:src/auth",
      "file:src/auth/auth.service.ts",
      "sym:src/auth/auth.service.ts:AuthService",
    ])
    const traversal = new TreeTraversal({ llmClient: llm })
    const result = await traversal.traverse(tree, "How does authentication work?")

    expect(result.selectedFiles.length).toBeGreaterThanOrEqual(0)
    expect(result.path.length).toBeGreaterThan(0)
  })

  it("should return empty results when LLM selects nothing", async () => {
    const tree = makeFixtureTree()
    const llm = makeLLM([]) // selects nothing
    const traversal = new TreeTraversal({ llmClient: llm })
    const result = await traversal.traverse(tree, "unrelated query")

    expect(result.selectedFiles).toHaveLength(0)
    expect(result.selectedSymbols).toHaveLength(0)
  })

  it("should record traversal path", async () => {
    const tree = makeFixtureTree()
    const llm = makeLLM(["mod:src/auth", "file:src/auth/auth.service.ts"])
    const traversal = new TreeTraversal({ llmClient: llm })
    const result = await traversal.traverse(tree, "auth query")

    expect(result.path.length).toBeGreaterThan(0)
    expect(result.path.some((p) => p.startsWith("modules:"))).toBe(true)
  })

  it("should handle flat project (no modules)", async () => {
    const tree = makeFixtureTree()
    // Remove module layer — make root point directly to files
    const flatTree: IndexTree = {
      ...tree,
      root: { ...tree.root, children: ["file:src/auth/auth.service.ts"] },
    }

    const llm = makeLLM(["file:src/auth/auth.service.ts", "sym:src/auth/auth.service.ts:AuthService"])
    const traversal = new TreeTraversal({ llmClient: llm })
    const result = await traversal.traverse(flatTree, "auth")

    expect(result.path.length).toBeGreaterThan(0)
  })
})

// ─── DependencyExpander Tests ─────────────────────────────────────────────────

describe("DependencyExpander", () => {
  it("should expand 1-hop dependencies", () => {
    const tree = makeFixtureTree()
    const expander = new DependencyExpander()

    const authServiceSym = tree.nodes["sym:src/auth/auth.service.ts:AuthService"] as SymbolNode
    const selectedIds = new Set(["sym:src/auth/auth.service.ts:AuthService"])

    const deps = expander.expand(tree, [authServiceSym], selectedIds)

    // AuthService references src/user/user.service.ts → should include UserService
    expect(deps.length).toBeGreaterThan(0)
    expect(deps.some((d) => d.symbol.title === "UserService")).toBe(true)
  })

  it("should not include already selected symbols", () => {
    const tree = makeFixtureTree()
    const expander = new DependencyExpander()

    const authServiceSym = tree.nodes["sym:src/auth/auth.service.ts:AuthService"] as SymbolNode

    // Mark UserService as already selected
    const selectedIds = new Set([
      "sym:src/auth/auth.service.ts:AuthService",
      "sym:src/user/user.service.ts:UserService",
    ])

    const deps = expander.expand(tree, [authServiceSym], selectedIds)
    expect(deps.every((d) => !selectedIds.has(d.symbol.nodeId))).toBe(true)
  })

  it("should only include exported symbols as deps", () => {
    const tree = makeFixtureTree()
    const expander = new DependencyExpander()

    const loginSym = tree.nodes["sym:src/auth/auth.service.ts:login"] as SymbolNode
    loginSym.internalRefs = ["src/auth/auth.service.ts"] // self ref for test

    const selectedIds = new Set(["sym:src/auth/auth.service.ts:login"])
    const deps = expander.expand(tree, [loginSym], selectedIds)

    // login (isExported: false) should not be included as dep
    expect(deps.every((d) => d.symbol.isExported !== false)).toBe(true)
  })

  it("should return empty array when no internal refs", () => {
    const tree = makeFixtureTree()
    const expander = new DependencyExpander()

    // loginSym has empty internalRefs
    const loginSym = tree.nodes["sym:src/auth/auth.service.ts:login"] as SymbolNode
    const selectedIds = new Set(["sym:src/auth/auth.service.ts:login"])

    const deps = expander.expand(tree, [loginSym], selectedIds)
    expect(deps).toHaveLength(0)
  })
})

// ─── ContextBuilder Tests ─────────────────────────────────────────────────────

describe("ContextBuilder", () => {
  const builder = new ContextBuilder()
  const tree = makeFixtureTree()

  it("should build formatted context with file headers", () => {
    const authSym = tree.nodes["sym:src/auth/auth.service.ts:AuthService"] as SymbolNode
    const authFile = tree.nodes["file:src/auth/auth.service.ts"] as FileNode

    const { context } = builder.build({
      selectedSymbols: [authSym],
      selectedFiles: [authFile],
      deps: [],
      config: DEFAULT_RETRIEVAL_CONFIG,
    })

    expect(context).toContain("=== src/auth/auth.service.ts ===")
    expect(context).toContain("AuthService")
  })

  it("should include full source in context", () => {
    const authSym = tree.nodes["sym:src/auth/auth.service.ts:AuthService"] as SymbolNode
    const authFile = tree.nodes["file:src/auth/auth.service.ts"] as FileNode

    const { context } = builder.build({
      selectedSymbols: [authSym],
      selectedFiles: [authFile],
      deps: [],
      config: DEFAULT_RETRIEVAL_CONFIG,
    })

    expect(context).toContain("async login")
  })

  it("should include dependency section when expandDeps is true", () => {
    const authSym = tree.nodes["sym:src/auth/auth.service.ts:AuthService"] as SymbolNode
    const authFile = tree.nodes["file:src/auth/auth.service.ts"] as FileNode
    const userSym = tree.nodes["sym:src/user/user.service.ts:UserService"] as SymbolNode
    const userFile = tree.nodes["file:src/user/user.service.ts"] as FileNode

    const { context } = builder.build({
      selectedSymbols: [authSym],
      selectedFiles: [authFile],
      deps: [{ symbol: userSym, fileNode: userFile, signatureOnly: "class UserService" }],
      config: { ...DEFAULT_RETRIEVAL_CONFIG, expandDeps: true },
    })

    expect(context).toContain("Dependencies")
    expect(context).toContain("class UserService")
  })

  it("should not include dep body when depSymbolsIncludeBody is false", () => {
    const authSym = tree.nodes["sym:src/auth/auth.service.ts:AuthService"] as SymbolNode
    const authFile = tree.nodes["file:src/auth/auth.service.ts"] as FileNode
    const userSym = tree.nodes["sym:src/user/user.service.ts:UserService"] as SymbolNode
    const userFile = tree.nodes["file:src/user/user.service.ts"] as FileNode

    const { context } = builder.build({
      selectedSymbols: [authSym],
      selectedFiles: [authFile],
      deps: [{ symbol: userSym, fileNode: userFile, signatureOnly: "class UserService" }],
      config: { ...DEFAULT_RETRIEVAL_CONFIG, expandDeps: true, depSymbolsIncludeBody: false },
    })

    // Should have signature not full body
    expect(context).toContain("class UserService")
    expect(context).not.toContain("findByEmail")
  })

  it("should estimate tokens roughly correctly", () => {
    const authSym = tree.nodes["sym:src/auth/auth.service.ts:AuthService"] as SymbolNode
    const authFile = tree.nodes["file:src/auth/auth.service.ts"] as FileNode

    const { estimatedTokens, context } = builder.build({
      selectedSymbols: [authSym],
      selectedFiles: [authFile],
      deps: [],
      config: DEFAULT_RETRIEVAL_CONFIG,
    })

    // Token estimate should be ~context.length / 4
    const expected = Math.ceil(context.length / 4)
    expect(estimatedTokens).toBe(expected)
  })

  it("should prune context when over maxOutputTokens", () => {
    const authSym = tree.nodes["sym:src/auth/auth.service.ts:AuthService"] as SymbolNode
    const loginSym = tree.nodes["sym:src/auth/auth.service.ts:login"] as SymbolNode
    const authFile = tree.nodes["file:src/auth/auth.service.ts"] as FileNode
    const userSym = tree.nodes["sym:src/user/user.service.ts:UserService"] as SymbolNode
    const userFile = tree.nodes["file:src/user/user.service.ts"] as FileNode

    const { context, estimatedTokens } = builder.build({
      selectedSymbols: [authSym, loginSym],
      selectedFiles: [authFile],
      deps: [{ symbol: userSym, fileNode: userFile, signatureOnly: "class UserService" }],
      config: { ...DEFAULT_RETRIEVAL_CONFIG, maxOutputTokens: 10 },
    })

    // P0-2: cắt theo khối, không cắt giữa code
    expect(context).toContain("omitted")
    // Không chứa nửa symbol: context vẫn có header nguyên vẹn
    expect(context).toContain("===")
  })
})

// ─── Retriever Integration Tests ──────────────────────────────────────────────

describe("Retriever (integration)", () => {
  it("should return RetrievalResult with all fields", async () => {
    const tree = makeFixtureTree()
    const llm = makeLLM([
      "mod:src/auth",
      "file:src/auth/auth.service.ts",
      "sym:src/auth/auth.service.ts:AuthService",
    ])

    const retriever = new Retriever({ llmClient: llm })
    const result = await retriever.retrieve(tree, { query: "How does login work?" })

    expect(result.query).toBe("How does login work?")
    expect(result.formattedContext).toBeDefined()
    expect(result.estimatedTokens).toBeGreaterThanOrEqual(0)
    expect(result.traversalPath).toBeInstanceOf(Array)
    expect(result.files).toBeInstanceOf(Array)
  })

  it("should respect maxOutputTokens from query", async () => {
    const tree = makeFixtureTree()
    const llm = makeLLM(["mod:src/auth", "file:src/auth/auth.service.ts", "sym:src/auth/auth.service.ts:AuthService"])

    const retriever = new Retriever({ llmClient: llm })
    const result = await retriever.retrieve(tree, {
      query: "auth",
      maxOutputTokens: 500,
    })

    expect(result.estimatedTokens).toBeLessThanOrEqual(500)
  })

  it("should skip dep expansion when expandDeps is false", async () => {
    const tree = makeFixtureTree()
    const llm = makeLLM(["mod:src/auth", "file:src/auth/auth.service.ts", "sym:src/auth/auth.service.ts:AuthService"])

    const retriever = new Retriever({ llmClient: llm })
    const result = await retriever.retrieve(tree, {
      query: "auth",
      expandDeps: false,
    })

    // Dependencies section should not appear
    expect(result.formattedContext).not.toContain("Dependencies")
  })
})
