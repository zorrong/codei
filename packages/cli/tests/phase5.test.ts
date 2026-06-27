/**
 * Phase 5 tests — CLI / IDE Integration
 * Dùng smoke tests + unit tests cho các component có thể test mà không cần LLM.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { HttpServer } from "../src/server/HttpServer.js"
import { inspectConfig, loadConfig, resolveApiKey } from "../src/config.js"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import type { LLMClient, LLMResponse } from "pnftrading_codei-core"
import { FileSystemIndexStore, TreeBuilder } from "pnftrading_codei-core"

// ─── Mock LLM ────────────────────────────────────────────────────────────────

const mockLlm: LLMClient = {
  async complete(): Promise<LLMResponse> {
    return {
      content: '{"short":"Mock summary","detailed":"Mock detailed"}',
      usage: { inputTokens: 10, outputTokens: 10 },
    }
  },
}

// ─── loadConfig Tests ─────────────────────────────────────────────────────────

describe("loadConfig", () => {
  let tmpDir: string
  let globalDir: string
  const originalGlobalDir = process.env["CODEI_GLOBAL_DIR"]

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "config-test-"))
    globalDir = path.join(tmpDir, ".global")
    await fs.mkdir(globalDir, { recursive: true })
    process.env["CODEI_GLOBAL_DIR"] = globalDir
  })

  afterAll(async () => {
    if (originalGlobalDir === undefined) {
      delete process.env["CODEI_GLOBAL_DIR"]
    } else {
      process.env["CODEI_GLOBAL_DIR"] = originalGlobalDir
    }
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it("should return defaults when no config file", () => {
    const config = loadConfig(tmpDir)
    expect(config.provider).toBe("openai")
    expect(config.indexDir).toBe(".index")
    expect(config.verbose).toBe(false)
  })

  it("should use only local project settings from .codei.json", async () => {
    await fs.writeFile(
      path.join(tmpDir, ".codei.json"),
      JSON.stringify({ provider: "anthropic", model: "claude-opus-4-5", indexDir: ".myindex" })
    )
    const config = loadConfig(tmpDir)
    expect(config.provider).toBe("openai")
    expect(config.model).toBe("gpt-4o")
    expect(config.indexDir).toBe(".myindex")

    await fs.unlink(path.join(tmpDir, ".codei.json"))
  })

  it("should apply CLI overrides over file config", async () => {
    await fs.writeFile(
      path.join(tmpDir, ".codei.json"),
      JSON.stringify({ provider: "openai", model: "gpt-4o" })
    )
    const config = loadConfig(tmpDir, { model: "gpt-4o-mini", verbose: true })
    expect(config.model).toBe("gpt-4o-mini")
    expect(config.verbose).toBe(true)

    await fs.unlink(path.join(tmpDir, ".codei.json"))
  })

  it("should read provider and API key from global .env", async () => {
    await fs.writeFile(
      path.join(globalDir, ".env"),
      "CODEI_PROVIDER=nvidia\nCODEI_API_KEY=test-global-key\nCODEI_MODEL=minimaxai/minimax-m3\n"
    )

    const config = loadConfig(tmpDir)
    expect(config.provider).toBe("nvidia")
    expect(config.model).toBe("minimaxai/minimax-m3")
    expect(resolveApiKey(config)).toBe("test-global-key")

    await fs.unlink(path.join(globalDir, ".env"))
  })

  it("should prefer global .env over legacy global config runtime values", async () => {
    await fs.writeFile(
      path.join(globalDir, "config.json"),
      JSON.stringify({
        provider: "openai",
        apiKey: "legacy-key",
        model: "legacy-model",
        baseURL: "https://legacy.example/v1",
      })
    )
    await fs.writeFile(
      path.join(globalDir, ".env"),
      "CODEI_PROVIDER=nvidia\nCODEI_API_KEY=test-global-key-env-priority\nCODEI_MODEL=minimaxai/minimax-m3\nCODEI_BASE_URL=https://integrate.api.nvidia.com/v1\n"
    )

    const config = loadConfig(tmpDir)
    expect(config.provider).toBe("nvidia")
    expect(config.model).toBe("minimaxai/minimax-m3")
    expect(config.baseURL).toBe("https://integrate.api.nvidia.com/v1")
    expect(resolveApiKey(config)).toBe("test-global-key-env-priority")

    await fs.unlink(path.join(globalDir, ".env"))
    await fs.unlink(path.join(globalDir, "config.json"))
  })

  it("should migrate legacy global config runtime values into global .env", async () => {
    await fs.writeFile(
      path.join(globalDir, "config.json"),
      JSON.stringify({
        provider: "nvidia",
        apiKey: "legacy-migrate-key",
        model: "minimaxai/minimax-m3",
        baseURL: "https://integrate.api.nvidia.com/v1",
      })
    )

    const config = loadConfig(tmpDir)
    expect(config.provider).toBe("nvidia")
    expect(resolveApiKey(config)).toBe("legacy-migrate-key")

    const migratedEnv = await fs.readFile(path.join(globalDir, ".env"), "utf-8")
    expect(migratedEnv).toContain("CODEI_PROVIDER=nvidia")
    expect(migratedEnv).toContain("CODEI_API_KEY=legacy-migrate-key")

    await fs.unlink(path.join(globalDir, ".env"))
    await fs.unlink(path.join(globalDir, "config.json"))
  })

  it("should keep global runtime config even if project .codei.json contains provider/model", async () => {
    await fs.writeFile(
      path.join(globalDir, ".env"),
      "CODEI_PROVIDER=nvidia\nCODEI_API_KEY=test-global-key-2\nCODEI_MODEL=minimaxai/minimax-m3\n"
    )
    await fs.writeFile(
      path.join(tmpDir, ".codei.json"),
      JSON.stringify({ provider: "openai", model: "codei", indexDir: ".myindex-2" })
    )

    const config = loadConfig(tmpDir)
    expect(config.provider).toBe("nvidia")
    expect(config.model).toBe("minimaxai/minimax-m3")
    expect(config.indexDir).toBe(".myindex-2")
    expect(resolveApiKey(config)).toBe("test-global-key-2")

    await fs.unlink(path.join(globalDir, ".env"))
    await fs.unlink(path.join(tmpDir, ".codei.json"))
  })

  it("should explain config sources for global env and project config", async () => {
    await fs.writeFile(
      path.join(globalDir, ".env"),
      "CODEI_PROVIDER=nvidia\nCODEI_API_KEY=test-global-key-3\nCODEI_MODEL=minimaxai/minimax-m3\n"
    )
    await fs.writeFile(
      path.join(tmpDir, ".codei.json"),
      JSON.stringify({ indexDir: ".doctor-index", model: "ignored-model" })
    )

    const debug = inspectConfig(tmpDir)
    expect(debug.effective.provider).toBe("nvidia")
    expect(debug.effective.indexDir).toBe(".doctor-index")
    expect(debug.fields.provider?.source).toBe("global-env")
    expect(debug.fields.apiKey?.source).toBe("global-env")
    expect(debug.fields.indexDir?.source).toBe("project-config")

    await fs.unlink(path.join(globalDir, ".env"))
    await fs.unlink(path.join(tmpDir, ".codei.json"))
  })

  it("should read API key from env", () => {
    process.env["OPENAI_API_KEY"] = "test-key-from-env"
    const config = loadConfig(tmpDir)
    const key = resolveApiKey(config)
    expect(key).toBe("test-key-from-env")
    delete process.env["OPENAI_API_KEY"]
  })

  it("should read provider and API key from project .env", async () => {
    await fs.writeFile(
      path.join(tmpDir, ".env"),
      "CODEI_PROVIDER=nvidia\nNVIDIA_API_KEY=test-nvidia-key\nCODEI_MODEL=minimaxai/minimax-m3\n"
    )

    const config = loadConfig(tmpDir)
    expect(config.provider).toBe("nvidia")
    expect(config.model).toBe("minimaxai/minimax-m3")
    expect(resolveApiKey(config)).toBe("test-nvidia-key")

    await fs.unlink(path.join(tmpDir, ".env"))
  })

  it("should infer nvidia provider from project .env without CODEI_PROVIDER", async () => {
    await fs.writeFile(
      path.join(tmpDir, ".env"),
      "NVIDIA_API_KEY=test-nvidia-key-2\nCODEI_BASE_URL=https://integrate.api.nvidia.com/v1\n"
    )

    const config = loadConfig(tmpDir)
    expect(config.provider).toBe("nvidia")
    expect(config.model).toBe("minimaxai/minimax-m3")
    expect(config.baseURL).toBe("https://integrate.api.nvidia.com/v1")
    expect(resolveApiKey(config)).toBe("test-nvidia-key-2")

    await fs.unlink(path.join(tmpDir, ".env"))
  })

  it("should return 'ollama' as key for ollama provider without env var", () => {
    const config = loadConfig(tmpDir, { provider: "ollama" })
    const key = resolveApiKey(config)
    expect(key).toBe("ollama")
  })

  it("should throw when no API key available", () => {
    delete process.env["OPENAI_API_KEY"]
    delete process.env["ANTHROPIC_API_KEY"]
    const config = loadConfig(tmpDir, { provider: "openai", apiKey: "" })
    expect(() => resolveApiKey(config)).toThrow()
  })
})

// ─── HttpServer Tests ─────────────────────────────────────────────────────────

describe("HttpServer", () => {
  let tmpDir: string
  let server: HttpServer
  const PORT = 13131 // dùng port khác để tránh conflict

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "server-test-"))

    // Build a minimal index để server có thể load
    const store = new FileSystemIndexStore(tmpDir, ".index")
    const builder = new TreeBuilder({ projectRoot: tmpDir, llmClient: mockLlm })
    const tree = await builder.build([])
    await store.saveTree(tree)
    await store.saveMeta({
      version: "1.0.0",
      projectRoot: tmpDir,
      gitHashMap: {},
      builtAt: Date.now(),
      totalFiles: 0,
      totalSymbols: 0,
    })

    const config = loadConfig(tmpDir, { provider: "openai", apiKey: "test-key", indexDir: ".index" })
    server = new HttpServer({ port: PORT, projectRoot: tmpDir, config, llmClient: mockLlm })
    await server.start()
  })

  afterAll(async () => {
    await server.stop()
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it("GET /health should return ok", async () => {
    const res = await fetch(`http://localhost:${PORT}/health`)
    expect(res.status).toBe(200)
    const body = await res.json() as { status: string }
    expect(body.status).toBe("ok")
  })

  it("GET /status should return index info", async () => {
    const res = await fetch(`http://localhost:${PORT}/status`)
    expect(res.status).toBe(200)
    const body = await res.json() as { exists: boolean }
    expect(body.exists).toBe(true)
  })

  it("POST /query with missing query field should return 400", async () => {
    const res = await fetch(`http://localhost:${PORT}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notQuery: "something" }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toContain("query")
  })

  it("POST /query should return context", async () => {
    const res = await fetch(`http://localhost:${PORT}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "how does auth work?", maxTokens: 1000 }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as {
      query: string
      context: string
      estimatedTokens: number
    }
    expect(body.query).toBe("how does auth work?")
    expect(typeof body.context).toBe("string")
    expect(typeof body.estimatedTokens).toBe("number")
  })

  it("POST /update should return update result", async () => {
    const res = await fetch(`http://localhost:${PORT}/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { upToDate: boolean }
    expect(typeof body.upToDate).toBe("boolean")
  })

  it("OPTIONS should return CORS headers", async () => {
    const res = await fetch(`http://localhost:${PORT}/query`, { method: "OPTIONS" })
    expect(res.status).toBe(204)
    expect(res.headers.get("access-control-allow-origin")).toBe("*")
  })

  it("Unknown endpoint should return 404", async () => {
    const res = await fetch(`http://localhost:${PORT}/nonexistent`)
    expect(res.status).toBe(404)
  })
})
