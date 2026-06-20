/**
 * `codeindex init` — tạo .codeindex.json config file trong project root.
 */

import type { Command } from "commander"
import * as path from "path"
import * as fs from "fs"
import * as readline from "readline"
import { loadConfig } from "../config.js"

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve))
}

export function registerInitCommand(program: Command): void {
  program
    .command("init [path]")
    .description("Tạo .codeindex.json config file cho project")
    .option("--yes", "Dùng default values, không hỏi")
    .action(async (targetPath: string | undefined, options: Record<string, boolean>) => {
      const projectRoot = path.resolve(targetPath ?? ".")
      const configPath = path.join(projectRoot, ".codeindex.json")

      if (fs.existsSync(configPath) && !options["yes"]) {
        console.log(`⚠️  .codeindex.json already exists at ${configPath}`)
        console.log("   Delete it first or use --yes to overwrite")
        process.exit(1)
      }

      // Load global config để lấy defaults
      const currentConfig = loadConfig(projectRoot)
      
      let provider = currentConfig.provider
      let model = currentConfig.model
      let indexDir = currentConfig.indexDir

      // Nếu global config đã có đủ thông tin (apiKey + provider), skip hỏi
      const hasGlobalConfig = currentConfig.apiKey || currentConfig.provider === "ollama"
      
      if (!options["yes"] && !hasGlobalConfig) {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        })

        console.log("\n🔧 codeindex project init\n")
        console.log(`⚠️  Chưa tìm thấy cấu hình toàn cục. Bạn nên chạy 'codeindex setup' trước.`)
        console.log(`   Hoặc tạo file .env trong project root, ví dụ: NVIDIA_API_KEY=... \n`)

        const providerInput = await ask(
          rl,
          `LLM provider [openai/anthropic/google/nvidia/custom/ollama] (mặc định: ${provider}): `
        )
        provider = (providerInput.trim() || provider) as any

        const modelDefaults: Record<string, string> = {
          openai: "gpt-4o",
          anthropic: "claude-sonnet-4-5",
          google: "gemini-1.5-flash",
          nvidia: "minimaxai/minimax-m3",
          custom: "gpt-4o-compatible",
          ollama: "llama3.2",
        }
        const defaultModel = modelDefaults[provider] ?? "gpt-4o"
        const modelInput = await ask(rl, `Model (mặc định: ${model || defaultModel}): `)
        model = modelInput.trim() || model || defaultModel

        const indexDirInput = await ask(rl, `Index directory (mặc định: ${indexDir}): `)
        indexDir = indexDirInput.trim() || indexDir

        rl.close()
      } else if (hasGlobalConfig && !options["yes"]) {
        console.log("\n🔧 codeindex project init\n")
        console.log(`💡 Sử dụng cấu hình toàn cục: ${currentConfig.provider} / ${currentConfig.model}`)
        console.log(`   (Chạy 'codeindex setup' để thay đổi cấu hình toàn cục)\n`)
      }

      const config: any = {
        provider,
        model,
        indexDir,
      }

      fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8")

      // Add .index to .gitignore nếu có
      const gitignorePath = path.join(projectRoot, ".gitignore")
      if (fs.existsSync(gitignorePath)) {
        const gitignore = fs.readFileSync(gitignorePath, "utf-8")
        if (!gitignore.includes(indexDir)) {
          fs.appendFileSync(gitignorePath, `\n# codeindex\n${indexDir}/\n`)
          console.log(`\n✅ Đã thêm "${indexDir}/" vào .gitignore`)
        }
      }

      console.log(`\n✅ Đã tạo .codeindex.json`)
      console.log(`\nNext steps:`)

      const envMap: Record<string, string> = {
        openai: "OPENAI_API_KEY",
        anthropic: "ANTHROPIC_API_KEY",
        google: "GOOGLE_API_KEY",
        nvidia: "NVIDIA_API_KEY",
        custom: "CUSTOM_API_KEY",
        ollama: "(không cần key)",
      }
      const envVar = envMap[provider] ?? "OPENAI_API_KEY"

      if (currentConfig.apiKey || provider === "ollama") {
        console.log(`   1. Build the index : codeindex index .`)
        console.log(`   2. Query the index : codeindex query "how does auth work?"`)
      } else {
        console.log(`   1. Set your API key: chạy 'codeindex setup', tạo file .env, hoặc 'export ${envVar}=<your-key>'`)
        console.log(`   2. Build the index : codeindex index .`)
        console.log(`   3. Query the index : codeindex query "how does auth work?"`)
      }
      console.log(`\n   Hoặc start IDE server: codeindex serve .`)
    })
}
