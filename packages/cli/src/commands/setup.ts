import type { Command } from "commander"
import * as readline from "readline"
import { saveGlobalConfig, saveGlobalEnv } from "../config.js"

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve))
}

export function registerSetupCommand(program: Command): void {
  program
    .command("setup")
    .description("Cài đặt cấu hình toàn cục (API key, Provider, Model) cho codeindex")
    .action(async () => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      })

      console.log("\n🔧 codeindex global setup\n")

      // 1. Provider
      const providerInput = await ask(
        rl,
        "LLM provider [openai/anthropic/google/nvidia/custom/ollama] (mặc định: openai): "
      )
      const provider = (providerInput.trim() || "openai") as any

      const config: any = { provider }

      // 2. API Key (nếu không phải ollama)
      if (provider !== "ollama") {
        const apiKey = await ask(rl, `Nhập API Key cho ${provider}: `)
        if (apiKey.trim()) {
          config.apiKey = apiKey.trim()
        }
      }

      // 3. Model Name (Tuỳ chọn)
      const modelDefaults: Record<string, string> = {
        openai: "gpt-4o",
        anthropic: "claude-sonnet-4-5",
        google: "gemini-1.5-flash",
        nvidia: "minimaxai/minimax-m3",
        custom: "gpt-4o-compatible",
        ollama: "llama3.2",
      }
      const defaultModel = modelDefaults[provider] || "gpt-4o"
      const modelName = await ask(rl, `Nhập Model name (mặc định: ${defaultModel}): `)
      if (modelName.trim()) {
        config.model = modelName.trim()
      }

      // 4. Base URL (Tuỳ chọn - cho OpenRouter, Proxy, v.v.)
      if (provider === "openai" || provider === "nvidia" || provider === "custom" || provider === "ollama") {
        const defaultURL = provider === "ollama"
          ? "http://localhost:11434/v1"
          : provider === "nvidia"
            ? "https://integrate.api.nvidia.com/v1"
            : ""
        const baseURLInput = await ask(
          rl, 
          `Nhập Base URL nếu dùng Proxy/OpenRouter (bỏ qua nếu dùng mặc định): `
        )
        if (baseURLInput.trim()) {
          config.baseURL = baseURLInput.trim()
        } else if ((provider === "ollama" || provider === "nvidia") && !baseURLInput.trim()) {
          config.baseURL = defaultURL
        }
      }

      saveGlobalConfig(config)
      saveGlobalEnv(config)
      
      rl.close()
      console.log(`\n✅ Đã lưu cấu hình toàn cục vào ~/.codeindex/config.json`)
      console.log(`✅ Đã lưu runtime env toàn cục vào ~/.codeindex/.env`)
      console.log(`\n✨ Xong! Chạy setup một lần, các lần sau 'codeindex index' sẽ dùng cấu hình toàn cục này.`)
    })
}
