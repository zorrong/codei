import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Command } from "commander"
import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import { registerInitCommand } from "../src/commands/init.js"

async function createTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix))
}

async function runInit(args: string[]): Promise<void> {
  const program = new Command()
  program.exitOverride()
  program.configureOutput({
    writeOut: () => undefined,
    writeErr: () => undefined,
  })
  registerInitCommand(program)
  await program.parseAsync(["node", "test", ...args], { from: "node" })
}

describe("init command agent integration", () => {
  let globalConfigDir: string
  let oldGlobalDir: string | undefined
  let logSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    globalConfigDir = await createTempDir("codei-global-")
    oldGlobalDir = process.env["CODEI_GLOBAL_DIR"]
    process.env["CODEI_GLOBAL_DIR"] = globalConfigDir
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined)
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
  })

  afterEach(async () => {
    if (oldGlobalDir === undefined) {
      delete process.env["CODEI_GLOBAL_DIR"]
    } else {
      process.env["CODEI_GLOBAL_DIR"] = oldGlobalDir
    }
    logSpy.mockRestore()
    errorSpy.mockRestore()
    await fs.rm(globalConfigDir, { recursive: true, force: true })
  })

  it("creates agent rule files with --agent all", async () => {
    const projectRoot = await createTempDir("codei-init-")
    await fs.writeFile(path.join(projectRoot, ".gitignore"), "node_modules/\n")

    await runInit(["init", projectRoot, "--yes", "--agent", "all"])

    await expect(fs.access(path.join(projectRoot, ".codei.json"))).resolves.toBeUndefined()
    await expect(fs.access(path.join(projectRoot, "AGENTS.md"))).resolves.toBeUndefined()
    await expect(fs.access(path.join(projectRoot, "CLAUDE.md"))).resolves.toBeUndefined()
    await expect(fs.access(path.join(projectRoot, ".cursorrules"))).resolves.toBeUndefined()
    await expect(fs.access(path.join(projectRoot, ".windsurfrules"))).resolves.toBeUndefined()
    await expect(fs.access(path.join(projectRoot, ".antigravity", "rules.md"))).resolves.toBeUndefined()

    const agents = await fs.readFile(path.join(projectRoot, "AGENTS.md"), "utf-8")
    expect(agents).toContain('codei query "<task-specific question>"')
    expect(agents).toContain("codei update")

    const gitignore = await fs.readFile(path.join(projectRoot, ".gitignore"), "utf-8")
    expect(gitignore).toContain("# codei")
    expect(gitignore).toContain(".index/")

    await fs.rm(projectRoot, { recursive: true, force: true })
  })

  it("does not overwrite existing agent rule files", async () => {
    const projectRoot = await createTempDir("codei-init-")
    const customInstructions = "# Existing\n\nKeep this project-specific instruction.\n"
    await fs.writeFile(path.join(projectRoot, "AGENTS.md"), customInstructions)

    await runInit(["init", projectRoot, "--yes", "--agent", "codex"])

    await expect(fs.readFile(path.join(projectRoot, "AGENTS.md"), "utf-8")).resolves.toBe(
      customInstructions
    )

    await fs.rm(projectRoot, { recursive: true, force: true })
  })
})
