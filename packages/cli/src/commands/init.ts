/**
 * `codei init` — tạo .codei.json config file trong project root.
 */

import type { Command } from "commander"
import * as path from "path"
import * as fs from "fs"
import * as readline from "readline"
import { loadConfig } from "../config.js"

type AgentTarget = "codex" | "claude" | "cursor" | "windsurf" | "antigravity"

interface AgentFile {
  target: AgentTarget
  path: string
  content: string
}

interface AgentWriteResult {
  created: string[]
  skipped: string[]
}

const AGENT_TARGETS: AgentTarget[] = ["codex", "claude", "cursor", "windsurf", "antigravity"]

const BASE_AGENT_INSTRUCTIONS = [
  "This project uses `codei` for codebase context retrieval.",
  "",
  "Before answering codebase questions, debugging, refactoring, or editing code:",
  "1. Run `codei query \"<task-specific question>\"`.",
  "2. Use the returned context as the primary map of relevant files and symbols.",
  "3. Read specific files only when deeper detail is needed.",
  "4. After changing code, run `codei update` so future queries stay accurate.",
  "",
  "Useful commands:",
  "- `codei query \"how does auth work?\"`",
  "- `codei status .`",
  "- `codei update`",
].join("\n")

const AGENT_FILES: AgentFile[] = [
  {
    target: "codex",
    path: "AGENTS.md",
    content: `# Agent Instructions\n\n${BASE_AGENT_INSTRUCTIONS}\n`,
  },
  {
    target: "claude",
    path: "CLAUDE.md",
    content: `# Claude Code Instructions\n\n${BASE_AGENT_INSTRUCTIONS}\n`,
  },
  {
    target: "cursor",
    path: ".cursorrules",
    content: `${BASE_AGENT_INSTRUCTIONS}\n`,
  },
  {
    target: "windsurf",
    path: ".windsurfrules",
    content: `${BASE_AGENT_INSTRUCTIONS}\n`,
  },
  {
    target: "antigravity",
    path: path.join(".antigravity", "rules.md"),
    content: `# Antigravity Instructions\n\n${BASE_AGENT_INSTRUCTIONS}\n`,
  },
]

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve))
}

function parseAgentTargets(value: string | boolean | undefined): AgentTarget[] {
  if (value === undefined || value === false || value === "") return []

  if (value === true) {
    return [...AGENT_TARGETS]
  }

  const rawTargets = value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)

  if (rawTargets.includes("all")) {
    return [...AGENT_TARGETS]
  }

  const unknown = rawTargets.filter((target) => !AGENT_TARGETS.includes(target as AgentTarget))
  if (unknown.length > 0) {
    throw new Error(
      `Unknown agent target "${unknown.join(", ")}". Use one of: ${AGENT_TARGETS.join(", ")}, all`
    )
  }

  return Array.from(new Set(rawTargets as AgentTarget[]))
}

function writeAgentFiles(projectRoot: string, targets: AgentTarget[]): AgentWriteResult {
  const selectedTargets = new Set(targets)
  const result: AgentWriteResult = { created: [], skipped: [] }

  for (const file of AGENT_FILES) {
    if (!selectedTargets.has(file.target)) continue

    const filePath = path.join(projectRoot, file.path)
    if (fs.existsSync(filePath)) {
      result.skipped.push(file.path)
      continue
    }

    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, file.content, "utf-8")
    result.created.push(file.path)
  }

  return result
}

export function registerInitCommand(program: Command): void {
  program
    .command("init [path]")
    .description("Tạo .codei.json config file cho project")
    .option("--yes", "Dùng default values, không hỏi")
    .option(
      "--agent <target>",
      "Generate AI agent rules: codex|claude|cursor|windsurf|antigravity|all"
    )
    .action(async (targetPath: string | undefined, options: Record<string, string | boolean>) => {
      const projectRoot = path.resolve(targetPath ?? ".")
      const configPath = path.join(projectRoot, ".codei.json")
      let agentTargets: AgentTarget[]

      try {
        agentTargets = parseAgentTargets(options["agent"])
      } catch (err) {
        console.error(`❌ ${(err as Error).message}`)
        process.exit(1)
      }

      if (fs.existsSync(configPath) && !options["yes"]) {
        console.log(`⚠️  .codei.json already exists at ${configPath}`)
        console.log("   Delete it first or use --yes to overwrite")
        process.exit(1)
      }

      // Load global config để lấy defaults
      const currentConfig = loadConfig(projectRoot)

      let indexDir = currentConfig.indexDir

      // Nếu global config đã có đủ thông tin (apiKey + provider), skip hỏi
      const hasGlobalConfig = currentConfig.apiKey || currentConfig.provider === "ollama"

      if (!options["yes"] && !hasGlobalConfig) {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        })

        console.log("\n🔧 codei project init\n")
        console.log(`⚠️  Chưa tìm thấy cấu hình toàn cục. Bạn nên chạy 'codei setup' trước.`)
        console.log(`   Lệnh 'setup' sẽ lưu vào ~/.codei/.env và dùng cho mọi project sau này.\n`)

        const indexDirInput = await ask(rl, `Index directory (mặc định: ${indexDir}): `)
        indexDir = indexDirInput.trim() || indexDir

        rl.close()
      } else if (hasGlobalConfig && !options["yes"]) {
        console.log("\n🔧 codei project init\n")
        console.log(`💡 Sử dụng cấu hình toàn cục: ${currentConfig.provider} / ${currentConfig.model}`)
        console.log(`   (Chạy 'codei setup' để thay đổi cấu hình toàn cục)\n`)
      }

      const config: any = {
        indexDir,
      }

      fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8")

      // Add .index to .gitignore nếu có
      const gitignorePath = path.join(projectRoot, ".gitignore")
      if (fs.existsSync(gitignorePath)) {
        const gitignore = fs.readFileSync(gitignorePath, "utf-8")
        if (!gitignore.includes(indexDir)) {
          fs.appendFileSync(gitignorePath, `\n# codei\n${indexDir}/\n`)
          console.log(`\n✅ Đã thêm "${indexDir}/" vào .gitignore`)
        }
      }

      console.log(`\n✅ Đã tạo .codei.json`)

      if (agentTargets.length > 0) {
        const agentResult = writeAgentFiles(projectRoot, agentTargets)
        console.log(`\n🤖 Agent integration files`)

        for (const file of agentResult.created) {
          console.log(`   ✅ Created ${file}`)
        }
        for (const file of agentResult.skipped) {
          console.log(`   ↷ Skipped existing ${file}`)
        }
      }

      console.log(`\nNext steps:`)

      if (currentConfig.apiKey || currentConfig.provider === "ollama") {
        console.log(`   1. Build the index : codei index .`)
        console.log(`   2. Query the index : codei query "how does auth work?"`)
      } else {
        console.log(`   1. Chạy 'codei setup' để lưu cấu hình toàn cục vào ~/.codei/.env`)
        console.log(`   2. Build the index : codei index .`)
        console.log(`   3. Query the index : codei query "how does auth work?"`)
      }
      console.log(`\n   Hoặc start IDE server: codei serve .`)
    })
}
