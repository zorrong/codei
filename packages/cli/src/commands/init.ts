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
        console.log(`   Lệnh 'setup' sẽ lưu vào ~/.codeindex/.env và dùng cho mọi project sau này.\n`)

        const indexDirInput = await ask(rl, `Index directory (mặc định: ${indexDir}): `)
        indexDir = indexDirInput.trim() || indexDir

        rl.close()
      } else if (hasGlobalConfig && !options["yes"]) {
        console.log("\n🔧 codeindex project init\n")
        console.log(`💡 Sử dụng cấu hình toàn cục: ${currentConfig.provider} / ${currentConfig.model}`)
        console.log(`   (Chạy 'codeindex setup' để thay đổi cấu hình toàn cục)\n`)
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
          fs.appendFileSync(gitignorePath, `\n# codeindex\n${indexDir}/\n`)
          console.log(`\n✅ Đã thêm "${indexDir}/" vào .gitignore`)
        }
      }

      console.log(`\n✅ Đã tạo .codeindex.json`)
      console.log(`\nNext steps:`)

      if (currentConfig.apiKey || currentConfig.provider === "ollama") {
        console.log(`   1. Build the index : codeindex index .`)
        console.log(`   2. Query the index : codeindex query "how does auth work?"`)
      } else {
        console.log(`   1. Chạy 'codeindex setup' để lưu cấu hình toàn cục vào ~/.codeindex/.env`)
        console.log(`   2. Build the index : codeindex index .`)
        console.log(`   3. Query the index : codeindex query "how does auth work?"`)
      }
      console.log(`\n   Hoặc start IDE server: codeindex serve .`)
    })
}
