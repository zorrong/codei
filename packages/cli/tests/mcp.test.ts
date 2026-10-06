import { describe, expect, it, beforeAll, afterAll } from "vitest"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import {
  IndexManager,
  TraversalCache,
  type LanguageAdapter,
  type ParsedFile,
  type LLMClient,
} from "pnftrading_codei-core"
import { createCodeiMcpServer } from "../src/commands/mcp.js"
import { createNoopLLMClient } from "../src/createServices.js"

function makeMockAdapter(projectRoot: string): LanguageAdapter {
  return {
    language: "typescript",
    fileExtensions: [".ts"],
    supports: (f) => f.endsWith(".ts"),
    async resolveImport() {
      return null
    },
    async parseFile(filePath: string): Promise<ParsedFile> {
      const relPath = path.relative(projectRoot, filePath).split(path.sep).join("/")
      const content = await fs.readFile(filePath, "utf-8")
      const className = content.match(/class\s+(\w+)/)?.[1] ?? "Unknown"
      return {
        filePath,
        relativePath: relPath,
        language: "typescript",
        symbols: [
          {
            name: className,
            kind: "class",
            signature: `class ${className}`,
            startLine: 1,
            endLine: content.split("\n").length,
            fullSource: content,
            isExported: true,
          },
        ],
        internalImports: [],
        externalImports: [],
        exports: [className],
      }
    },
  }
}

describe("MCP server", () => {
  let tmpDir: string
  let client: Client

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "codei-mcp-"))
    await fs.mkdir(path.join(tmpDir, "src"), { recursive: true })
    await fs.writeFile(
      path.join(tmpDir, "src/auth.ts"),
      "export class AuthService {\n  login() { return true }\n}\n"
    )

    const llm: LLMClient = createNoopLLMClient()
    const manager = new IndexManager({
      projectRoot: tmpDir,
      llmClient: llm,
      adapters: [makeMockAdapter(tmpDir)],
      indexDir: ".index-mcp",
      summaryMode: "heuristic",
    })
    await manager.build()

    const server = createCodeiMcpServer({
      projectRoot: tmpDir,
      config: {
        provider: "openai",
        model: "test",
        apiKey: "",
        indexDir: ".index-mcp",
        summaryMode: "heuristic",
        verbose: false,
      },
      llmClient: llm,
      cache: new TraversalCache(),
    })

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    client = new Client({ name: "test-client", version: "0.0.0" }, { capabilities: {} })
    await server.connect(serverTransport)
    await client.connect(clientTransport)
  }, 30000)

  afterAll(async () => {
    await client.close()
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it("exposes codei_query, codei_update, codei_status", async () => {
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual([
      "codei_query",
      "codei_status",
      "codei_update",
    ])
  })

  it("codei_query trả context chứa symbol liên quan", async () => {
    const res = await client.callTool({ name: "codei_query", arguments: { query: "AuthService login" } })
    const text = (res.content as Array<{ type: string; text: string }>)
      .map((c) => c.text)
      .join("\n")
    expect(text).toContain("AuthService")
    expect(text).toContain("tokens:")
  })

  it("codei_status báo index tồn tại", async () => {
    const res = await client.callTool({ name: "codei_status", arguments: {} })
    const text = (res.content as Array<{ type: string; text: string }>)
      .map((c) => c.text)
      .join("\n")
    const parsed = JSON.parse(text)
    expect(parsed.exists).toBe(true)
    expect(parsed.totalFiles).toBeGreaterThan(0)
  })

  it("codei_update báo up-to-date khi không đổi", async () => {
    const res = await client.callTool({ name: "codei_update", arguments: {} })
    const text = (res.content as Array<{ type: string; text: string }>)
      .map((c) => c.text)
      .join("\n")
    expect(JSON.parse(text).upToDate).toBe(true)
  })
})
