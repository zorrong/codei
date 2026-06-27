/**
 * Phase 2 tests — Index Builder
 * Dùng mock LLMClient để không cần real API calls trong tests.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { TreeBuilder } from "../src/tree/TreeBuilder.js"
import { SummaryGenerator } from "../src/llm/SummaryGenerator.js"
import { FileSystemIndexStore } from "../src/storage/FileSystemIndexStore.js"
import type { LLMClient, LLMRequest, LLMResponse } from "../src/types/LLMClient.js"
import type { ParsedFile } from "../src/types/RawSymbol.js"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"

// ─── Mock LLM Client ──────────────────────────────────────────────────────────

class MockLLMClient implements LLMClient {
  calls: LLMRequest[] = []

  async complete(request: LLMRequest): Promise<LLMResponse> {
    this.calls.push(request)
    const label = request.requestLabel ?? ""

    // Return different mocks based on label
    if (label.startsWith("summary:module")) {
      return {
        content: '{"short": "Module handling authentication and user management"}',
        usage: { inputTokens: 50, outputTokens: 20 },
      }
    }
    if (label.startsWith("summary:file")) {
      return {
        content: '{"short": "Handles JWT auth and token management", "detailed": "AuthService provides login, token validation and refresh. Exports AuthService class and supporting interfaces."}',
        usage: { inputTokens: 100, outputTokens: 40 },
      }
    }
    if (label.startsWith("traverse")) {
      return {
        content: '{"selected": [], "reasoning": "mock traversal"}',
        usage: { inputTokens: 80, outputTokens: 20 },
      }
    }
    return {
      content: '{"short": "Mock summary", "detailed": "Mock detailed summary"}',
      usage: { inputTokens: 50, outputTokens: 20 },
    }
  }
}

// ─── Fixture ParsedFiles ──────────────────────────────────────────────────────

const authServiceFile: ParsedFile = {
  filePath: "/project/src/auth/auth.service.ts",
  relativePath: "src/auth/auth.service.ts",
  language: "typescript",
  symbols: [
    {
      name: "AuthService",
      kind: "class",
      signature: "class AuthService",
      startLine: 10,
      endLine: 60,
      fullSource: "class AuthService { async login(dto: LoginDto): Promise<TokenPair> { return {} as TokenPair } }",
      isExported: true,
      docComment: "Handles JWT-based authentication",
    },
    {
      name: "login",
      kind: "method",
      signature: "async login(dto: LoginDto): Promise<TokenPair>",
      startLine: 20,
      endLine: 30,
      fullSource: "async login(dto: LoginDto): Promise<TokenPair> { return {} as TokenPair }",
      isExported: false,
      parentName: "AuthService",
    },
  ],
  internalImports: ["src/user/user.service.ts"],
  externalImports: ["jsonwebtoken"],
  exports: ["AuthService", "LoginDto", "TokenPair"],
}

const utilsFile: ParsedFile = {
  filePath: "/project/src/utils.ts",
  relativePath: "src/utils.ts",
  language: "typescript",
  symbols: [
    {
      name: "hashPassword",
      kind: "function",
      signature: "async function hashPassword(password: string): Promise<string>",
      startLine: 5,
      endLine: 10,
      fullSource: "async function hashPassword(password: string): Promise<string> { return `hashed_${password}` }",
      isExported: true,
    },
  ],
  internalImports: [],
  externalImports: ["bcrypt"],
  exports: ["hashPassword"],
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("SummaryGenerator", () => {
  const mockLlm = new MockLLMClient()
  const generator = new SummaryGenerator(mockLlm)

  it("should generate file summary from ParsedFile", async () => {
    const result = await generator.generateFileSummary(authServiceFile)

    expect(result.relativePath).toBe("src/auth/auth.service.ts")
    expect(result.shortSummary).toBeTruthy()
    expect(result.detailedSummary).toBeTruthy()
    expect(result.shortSummary.length).toBeGreaterThan(5)
  })

  it("should call LLM with signatures only (not full source)", async () => {
    mockLlm.calls = []
    await generator.generateFileSummary(authServiceFile)

    const lastCall = mockLlm.calls[mockLlm.calls.length - 1]
    const prompt = lastCall?.messages[0]?.content ?? ""

    // Should contain signature
    expect(prompt).toContain("class AuthService")
    // Should NOT contain full body code
    expect(prompt).not.toContain("return {} as TokenPair")
  })

  it("should generate module summary", async () => {
    const result = await generator.generateModuleSummary("src/auth", [
      { relativePath: "src/auth/auth.service.ts", shortSummary: "JWT auth service", detailedSummary: "" },
    ])

    expect(result.dirPath).toBe("src/auth")
    expect(result.shortSummary).toBeTruthy()
  })

  it("should batch generate summaries for multiple files", async () => {
    const results = await generator.generateFileSummaries([authServiceFile, utilsFile])

    expect(results.size).toBe(2)
    expect(results.has("src/auth/auth.service.ts")).toBe(true)
    expect(results.has("src/utils.ts")).toBe(true)
  })

  it("should handle LLM returning invalid JSON gracefully", async () => {
    const badLlm: LLMClient = {
      async complete(): Promise<LLMResponse> {
        return { content: "not json at all", usage: { inputTokens: 10, outputTokens: 5 } }
      },
    }
    const gen = new SummaryGenerator(badLlm)
    const result = await gen.generateFileSummary(authServiceFile)

    // Should return fallback, not throw
    expect(result.shortSummary).toBeTruthy()
    expect(result.relativePath).toBe("src/auth/auth.service.ts")
  })
})

describe("TreeBuilder", () => {
  const mockLlm = new MockLLMClient()

  it("should build tree with correct node structure", async () => {
    const builder = new TreeBuilder({
      projectRoot: "/project",
      projectName: "test-project",
      llmClient: mockLlm,
    })

    const tree = await builder.build([authServiceFile, utilsFile])

    expect(tree.root).toBeDefined()
    expect(tree.root.level).toBe("project")
    expect(tree.root.title).toBe("test-project")
    expect(Object.keys(tree.nodes).length).toBeGreaterThan(0)
  })

  it("should create file nodes for each parsed file", async () => {
    const builder = new TreeBuilder({
      projectRoot: "/project",
      llmClient: mockLlm,
    })

    const tree = await builder.build([authServiceFile, utilsFile])
    const nodeKeys = Object.keys(tree.nodes)

    expect(nodeKeys).toContain("file:src/auth/auth.service.ts")
    expect(nodeKeys).toContain("file:src/utils.ts")
  })

  it("should create symbol nodes for each symbol", async () => {
    const builder = new TreeBuilder({ projectRoot: "/project", llmClient: mockLlm })
    const tree = await builder.build([authServiceFile])
    const nodeKeys = Object.keys(tree.nodes)

    expect(nodeKeys).toContain("sym:src/auth/auth.service.ts:AuthService")
    expect(nodeKeys).toContain("sym:src/auth/auth.service.ts:login")
  })

  it("should create module nodes grouping files by directory", async () => {
    const builder = new TreeBuilder({ projectRoot: "/project", llmClient: mockLlm })
    const tree = await builder.build([authServiceFile, utilsFile])
    const nodeKeys = Object.keys(tree.nodes)

    expect(nodeKeys.some((k) => k.startsWith("mod:"))).toBe(true)
  })

  it("should set correct parent-child relationships", async () => {
    const builder = new TreeBuilder({ projectRoot: "/project", llmClient: mockLlm })
    const tree = await builder.build([authServiceFile])

    const fileNode = tree.nodes["file:src/auth/auth.service.ts"]
    const symbolNode = tree.nodes["sym:src/auth/auth.service.ts:AuthService"]

    expect(fileNode?.children).toContain("sym:src/auth/auth.service.ts:AuthService")
    expect(symbolNode?.parentId).toBe("file:src/auth/auth.service.ts")
  })

  it("should set version and builtAt", async () => {
    const builder = new TreeBuilder({ projectRoot: "/project", llmClient: mockLlm })
    const before = Date.now()
    const tree = await builder.build([authServiceFile])
    const after = Date.now()

    expect(tree.version).toBe("1.0.0")
    expect(tree.builtAt).toBeGreaterThanOrEqual(before)
    expect(tree.builtAt).toBeLessThanOrEqual(after)
  })

  it("should updatePartial — only rebuild changed file nodes", async () => {
    const builder = new TreeBuilder({ projectRoot: "/project", llmClient: mockLlm })
    const tree = await builder.build([authServiceFile, utilsFile])

    const modifiedUtils: ParsedFile = {
      ...utilsFile,
      symbols: [
        ...utilsFile.symbols,
        {
          name: "comparePasswords",
          kind: "function",
          signature: "async function comparePasswords(a: string, b: string): Promise<boolean>",
          startLine: 12,
          endLine: 16,
          fullSource: "async function comparePasswords(a: string, b: string): Promise<boolean> { return a === b }",
          isExported: true,
        },
      ],
    }

    const updatedTree = await builder.updatePartial(tree, [modifiedUtils])

    // New symbol should exist
    expect(updatedTree.nodes["sym:src/utils.ts:comparePasswords"]).toBeDefined()
    // Auth nodes should be unchanged
    expect(updatedTree.nodes["sym:src/auth/auth.service.ts:AuthService"]).toBeDefined()
  })
})

describe("FileSystemIndexStore", () => {
  let tmpDir: string
  let store: FileSystemIndexStore

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "codei-test-"))
    store = new FileSystemIndexStore(tmpDir)
  })

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it("should return false when index does not exist", async () => {
    expect(await store.exists()).toBe(false)
  })

  it("should save and load tree", async () => {
    const mockLlm = new MockLLMClient()
    const builder = new TreeBuilder({ projectRoot: tmpDir, llmClient: mockLlm })
    const tree = await builder.build([authServiceFile])

    await store.saveTree(tree)
    expect(await store.exists()).toBe(true)

    const loaded = await store.loadTree()
    expect(loaded).not.toBeNull()
    expect(loaded?.root.level).toBe("project")
    expect(Object.keys(loaded?.nodes ?? {}).length).toBeGreaterThan(0)
  })

  it("should save and load meta", async () => {
    const meta = {
      version: "1.0.0",
      projectRoot: tmpDir,
      gitHashMap: { "src/auth/auth.service.ts": "abc123" },
      builtAt: Date.now(),
      totalFiles: 1,
      totalSymbols: 2,
    }

    await store.saveMeta(meta)
    const loaded = await store.loadMeta()

    expect(loaded?.version).toBe("1.0.0")
    expect(loaded?.gitHashMap["src/auth/auth.service.ts"]).toBe("abc123")
  })

  it("should return null when tree does not exist (loadTree)", async () => {
    const emptyStore = new FileSystemIndexStore(tmpDir, ".index-nonexistent")
    const result = await emptyStore.loadTree()
    expect(result).toBeNull()
  })

  it("should delete file node", async () => {
    const mockLlm = new MockLLMClient()
    const builder = new TreeBuilder({ projectRoot: tmpDir, llmClient: mockLlm })
    const tree = await builder.build([authServiceFile])
    const fileNode = tree.nodes["file:src/auth/auth.service.ts"]

    if (fileNode?.level === "file") {
      await store.saveFileNode(fileNode)
      await store.deleteFileNode("src/auth/auth.service.ts")
      const loaded = await store.loadFileNode("src/auth/auth.service.ts")
      expect(loaded).toBeNull()
    }
  })
})
