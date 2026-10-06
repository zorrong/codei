/**
 * Retrieval accuracy harness — chạy offline (LLM luôn throw → heuristic),
 * xác định, chạy được trong CI.
 *
 * Mục đích: khóa recall sau các vòng cắt token (cutoff 30%, top-3 tiered,
 * dedup lồng nhau). Cắt thêm trong tương lai không được làm rớt các case này.
 *
 * Đo 2 mức:
 * - retrieval recall: expected file/symbol có trong result.files không
 * - render recall: signature hoặc body của expected symbol có trong context không
 *   (symbol hạng thấp vẫn phải còn ít nhất signature, symbol lồng nhau còn
 *   trong container)
 */
import { describe, expect, it } from "vitest"
import { Retriever } from "../src/retrieval/Retriever.js"
import type { LLMClient } from "../src/types/LLMClient.js"
import type { FileNode, IndexTree, SymbolNode } from "../src/types/TreeNode.js"

const throwingLlm: LLMClient = {
  async complete() {
    throw new Error("offline — heuristic only")
  },
}

let seq = 0

function sym(
  name: string,
  file: string,
  kind: string,
  source: string,
  summary: string,
  start: number,
  end: number
): SymbolNode {
  return {
    nodeId: `sym:${file}:${name}#${seq++}`,
    title: name,
    level: "symbol",
    shortSummary: summary,
    filePath: file,
    signature: source.split("\n")[0] ?? name,
    fullSource: source,
    startLine: start,
    endLine: end,
    kind,
    isExported: true,
    internalRefs: [],
    children: [],
    parentId: `file:${file}`,
  }
}

function file(filePath: string, summary: string, syms: SymbolNode[]): FileNode {
  return {
    nodeId: `file:${filePath}`,
    title: filePath.split("/").pop() ?? filePath,
    level: "file",
    shortSummary: summary,
    filePath,
    gitHash: "x",
    indexedAt: 1,
    exports: syms.map((s) => s.title),
    internalDeps: [],
    externalDeps: [],
    children: syms.map((s) => s.nodeId),
    parentId: "project:root",
  }
}

function buildTree(): IndexTree {
  const authCls = sym(
    "AuthService",
    "src/auth/auth.service.ts",
    "class",
    "class AuthService {\n  login() { return MARKER_LOGIN_BODY }\n}",
    "JWT auth service, user login and token validation",
    10,
    50
  )
  const login = sym(
    "login",
    "src/auth/auth.service.ts",
    "method",
    "login() { return MARKER_LOGIN_BODY }",
    "Authenticate user with email and password",
    20,
    30
  )
  const hashPw = sym(
    "hashPassword",
    "src/auth/auth.service.ts",
    "function",
    "function hashPassword(pw: string) { return MARKER_HASH_BODY }",
    "Hash user passwords with bcrypt before storing",
    55,
    70
  )
  const userCls = sym(
    "UserService",
    "src/user/user.service.ts",
    "class",
    "class UserService {\n  findByEmail(e: string) { return MARKER_FIND_BODY }\n}",
    "User records management, find users by email",
    5,
    30
  )
  const dbCls = sym(
    "Database",
    "src/db/database.ts",
    "class",
    "class Database {\n  pool() { return MARKER_POOL_BODY }\n}",
    "Postgres connection pool setup and management",
    1,
    40
  )
  const connect = sym(
    "connect",
    "src/db/database.ts",
    "function",
    "function connect() { return MARKER_CONNECT_BODY }",
    "Open a database connection from the pool",
    45,
    60
  )

  const files = [
    file("src/auth/auth.service.ts", "JWT authentication module with login and password hashing", [
      authCls,
      login,
      hashPw,
    ]),
    file("src/user/user.service.ts", "User records module", [userCls]),
    file("src/db/database.ts", "Database connection module", [dbCls, connect]),
  ]

  const root = {
    nodeId: "project:root",
    title: "root",
    level: "project" as const,
    shortSummary: "root",
    rootPath: "/",
    primaryLanguage: "typescript",
    children: files.map((f) => f.nodeId),
  }
  const nodes: IndexTree["nodes"] = { [root.nodeId]: root }
  for (const f of files) nodes[f.nodeId] = f
  for (const s of [authCls, login, hashPw, userCls, dbCls, connect]) nodes[s.nodeId] = s
  return { root, version: "1", builtAt: 1, nodes }
}

interface Case {
  id: string
  query: string
  expectedFiles: string[]
  /** mỗi symbol phải có mặt trong files[].symbols */
  expectedSymbols: string[]
  /** mỗi marker phải có trong formattedContext (full body hoặc signature) */
  expectedMarkers: string[]
}

const CASES: Case[] = [
  {
    id: "nested-class-method",
    query: "How does AuthService login work?",
    expectedFiles: ["src/auth/auth.service.ts"],
    expectedSymbols: ["AuthService"],
    // login bị dedup vào class nhưng body vẫn còn qua container
    expectedMarkers: ["MARKER_LOGIN_BODY"],
  },
  {
    id: "single-function",
    query: "How is password hash computed?",
    expectedFiles: ["src/auth/auth.service.ts"],
    expectedSymbols: ["hashPassword"],
    expectedMarkers: ["MARKER_HASH_BODY"],
  },
  {
    id: "two-files",
    query: "How do AuthService and UserService work together?",
    expectedFiles: ["src/auth/auth.service.ts", "src/user/user.service.ts"],
    expectedSymbols: ["AuthService", "UserService"],
    // file thứ 2 điểm thấp hơn nhưng không được rớt khỏi cutoff
    expectedMarkers: ["MARKER_LOGIN_BODY", "MARKER_FIND_BODY"],
  },
  {
    id: "db-module",
    query: "Database connection pool setup",
    expectedFiles: ["src/db/database.ts"],
    expectedSymbols: ["Database", "connect"],
    expectedMarkers: ["MARKER_POOL_BODY", "MARKER_CONNECT_BODY"],
  },
]

describe("retrieval accuracy (offline heuristic)", () => {
  for (const c of CASES) {
    it(`${c.id}: recall file + symbol + render`, async () => {
      const retriever = new Retriever({ llmClient: throwingLlm })
      const result = await retriever.retrieve(buildTree(), { query: c.query })

      const foundFiles = result.files.map((f) => f.node.filePath)
      for (const f of c.expectedFiles) {
        expect(foundFiles, `query "${c.query}" thiếu file`).toContain(f)
      }

      const foundSymbols = result.files.flatMap((f) => f.symbols.map((s) => s.node.title))
      for (const s of c.expectedSymbols) {
        expect(foundSymbols, `query "${c.query}" thiếu symbol`).toContain(s)
      }

      for (const m of c.expectedMarkers) {
        expect(result.formattedContext, `query "${c.query}" mất marker`).toContain(m)
      }

      expect(result.estimatedTokens).toBeLessThanOrEqual(4000)
    })
  }

  it("aggregate: fileHitRate 100%, token trung bình dưới budget", async () => {
    const retriever = new Retriever({ llmClient: throwingLlm })
    let fileHits = 0
    let fileTotal = 0
    let tokens = 0
    for (const c of CASES) {
      const result = await retriever.retrieve(buildTree(), { query: c.query })
      const found = new Set(result.files.map((f) => f.node.filePath))
      for (const f of c.expectedFiles) {
        fileTotal++
        if (found.has(f)) fileHits++
      }
      tokens += result.estimatedTokens
    }
    expect(fileHits / fileTotal).toBe(1)
    expect(tokens / CASES.length).toBeLessThan(4000)
  })
})
