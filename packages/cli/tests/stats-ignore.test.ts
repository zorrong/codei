import { describe, expect, it, beforeEach, afterEach } from "vitest"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { logQuery, readStats, queryLogPath } from "../src/telemetry.js"
import { shouldFailStale } from "../src/commands/status.js"
import { loadConfig } from "../src/config.js"
import { FileScanner } from "pnftrading_codei-core"

describe("telemetry (mục 3)", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "codei-telemetry-"))
  })

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true })
  })

  it("logQuery ghi JSONL, readStats cộng dồn đúng", () => {
    expect(readStats(tmpDir, ".index").count).toBe(0)

    logQuery(tmpDir, ".index", {
      ts: 1000,
      query: "auth flow",
      estimatedTokens: 800,
      rawTokens: 4000,
      savedPct: 80,
      files: ["src/auth.ts"],
      cache: "miss",
    })
    logQuery(tmpDir, ".index", {
      ts: 2000,
      query: "db config",
      estimatedTokens: 1200,
      rawTokens: 4000,
      savedPct: 70,
      files: ["src/db.ts"],
      cache: "exact",
    })

    expect(fs.existsSync(queryLogPath(tmpDir, ".index"))).toBe(true)
    const stats = readStats(tmpDir, ".index")
    expect(stats.count).toBe(2)
    expect(stats.totalTokens).toBe(2000)
    expect(stats.avgTokens).toBe(1000)
    expect(stats.avgSavedPct).toBe(75)
    expect(stats.since).toBe(1000)
  })

  it("bỏ qua dòng hỏng, không throw khi không ghi được", () => {
    fs.mkdirSync(path.join(tmpDir, ".index"), { recursive: true })
    fs.writeFileSync(
      path.join(tmpDir, ".index", "query-log.jsonl"),
      '{"ts":1,"estimatedTokens":100}\nnot-json\n{"bad":true}\n',
      "utf-8"
    )
    expect(readStats(tmpDir, ".index").count).toBe(1)
    // path là file → mkdirSync throw bên trong, phải nuốt lỗi
    const fileAsDir = path.join(tmpDir, "somefile")
    fs.writeFileSync(fileAsDir, "x")
    expect(() =>
      logQuery(fileAsDir, "sub", { ts: 1, query: "q", estimatedTokens: 1, files: [] })
    ).not.toThrow()
  })
})

describe("status --fail-if-stale (mục 4)", () => {
  it("chỉ fail khi stale + flag bật + index tồn tại", () => {
    expect(shouldFailStale({ exists: true, isStale: true }, true)).toBe(true)
    expect(shouldFailStale({ exists: true, isStale: false }, true)).toBe(false)
    expect(shouldFailStale({ exists: true, isStale: true }, false)).toBe(false)
    expect(shouldFailStale({ exists: false, isStale: false }, true)).toBe(false)
  })
})

describe("config ignore (mục 5)", () => {
  it("loadConfig đọc ignore từ .codei.json", async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "codei-ignore-"))
    try {
      await fs.promises.writeFile(
        path.join(dir, ".codei.json"),
        JSON.stringify({ indexDir: ".index", ignore: ["tests", "fixtures"] }),
        "utf-8"
      )
      expect(loadConfig(dir).ignore).toEqual(["tests", "fixtures"])
    } finally {
      await fs.promises.rm(dir, { recursive: true, force: true })
    }
  })

  it("FileScanner bỏ qua thư mục trong ignoreDirs", async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "codei-scan-"))
    try {
      await fs.promises.mkdir(path.join(dir, "src"), { recursive: true })
      await fs.promises.mkdir(path.join(dir, "tests"), { recursive: true })
      await fs.promises.writeFile(path.join(dir, "src/a.ts"), "export const a = 1")
      await fs.promises.writeFile(path.join(dir, "tests/a.test.ts"), "test")
      const scanner = new FileScanner({
        projectRoot: dir,
        extensions: [".ts"],
        ignoreDirs: ["tests"],
      })
      const rels = scanner
        .scan({})
        .allFiles.map((f) => path.relative(dir, f).split(path.sep).join("/"))
      expect(rels).toContain("src/a.ts")
      expect(rels.some((p) => p.startsWith("tests/"))).toBe(false)
    } finally {
      await fs.promises.rm(dir, { recursive: true, force: true })
    }
  })
})
