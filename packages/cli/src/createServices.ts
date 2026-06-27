/**
 * createServices — factory tạo LLMClient + IndexManager từ config.
 * Shared bởi tất cả CLI commands.
 */

import type { LLMClient, LanguageAdapter } from "@pnftrading/codei-core"
import { IndexManager } from "@pnftrading/codei-core"
import { TypeScriptAdapter } from "@pnftrading/codei-adapter-typescript"
import { OpenAILLMClient, AnthropicLLMClient, GoogleLLMClient } from "./llm/LLMClients.js"
import { type CodeiConfig, resolveApiKey } from "./config.js"

// Tất cả adapters — mỗi adapter đăng ký extensions riêng
async function loadAllAdapters(verbose = false): Promise<LanguageAdapter[]> {
  const adapters: LanguageAdapter[] = [
    new TypeScriptAdapter(), // .ts, .tsx
  ]

  // Dynamic import các adapters khác (safe fallback nếu chưa build)
  const optionalAdapters: Array<{ load: () => Promise<LanguageAdapter>; name: string }> = [
    { name: "python", load: async () => { const { PythonAdapter } = await import("@pnftrading/codei-adapter-python"); return new PythonAdapter() } },
    { name: "go", load: async () => { const { GoAdapter } = await import("@pnftrading/codei-adapter-go"); return new GoAdapter() } },
    { name: "java", load: async () => { const { JavaAdapter } = await import("@pnftrading/codei-adapter-java"); return new JavaAdapter() } },
    { name: "php", load: async () => { const { PhpAdapter } = await import("@pnftrading/codei-adapter-php"); return new PhpAdapter() } },
    { name: "rust", load: async () => { const { RustAdapter } = await import("@pnftrading/codei-adapter-rust"); return new RustAdapter() } },
    { name: "csharp", load: async () => { const { CSharpAdapter } = await import("@pnftrading/codei-adapter-csharp"); return new CSharpAdapter() } },
    { name: "cpp", load: async () => { const { CppAdapter } = await import("@pnftrading/codei-adapter-cpp"); return new CppAdapter() } },
    { name: "swift", load: async () => { const { SwiftAdapter } = await import("@pnftrading/codei-adapter-swift"); return new SwiftAdapter() } },
  ]

  for (const { name, load } of optionalAdapters) {
    try {
      adapters.push(await load())
    } catch (error) {
      // Adapter optional có thể chưa được cài hoặc chưa build.
      // Ở chế độ verbose, log rõ để user biết language support nào đang thiếu.
      if (verbose) {
        const message = error instanceof Error ? error.message : String(error)
        console.warn(`[codei] Optional adapter "${name}" not loaded: ${message}`)
      }
    }
  }

  return adapters
}

export function createLLMClient(config: CodeiConfig): LLMClient {
  const apiKey = resolveApiKey(config)

  switch (config.provider) {
    case "anthropic":
      return new AnthropicLLMClient({ apiKey, model: config.model })

    case "google":
      return new GoogleLLMClient({ apiKey, model: config.model })

    case "nvidia":
      return new OpenAILLMClient({
        apiKey,
        model: config.model,
        baseURL: config.baseURL ?? "https://integrate.api.nvidia.com/v1",
      })

    case "ollama":
      return new OpenAILLMClient({
        apiKey: "ollama",
        model: config.model,
        baseURL: config.baseURL ?? "http://localhost:11434/v1",
      })

    case "custom":
    case "openai":
    default:
      return new OpenAILLMClient({
        apiKey,
        model: config.model,
        ...(config.baseURL !== undefined && { baseURL: config.baseURL }),
      })
  }
}

export function createNoopLLMClient(): LLMClient {
  return {
    complete: async () => {
      throw new Error("LLM is disabled")
    },
  }
}


export async function createIndexManager(
  projectRoot: string,
  config: CodeiConfig,
  llmClient: LLMClient
): Promise<IndexManager> {
  const adapters = await loadAllAdapters(config.verbose)
  
  return new IndexManager({
    projectRoot,
    llmClient,
    adapters,
    indexDir: config.indexDir,
    verbose: config.verbose,
    ...(config.projectName !== undefined && { projectName: config.projectName }),
    ...(config.summaryMode !== undefined && { summaryMode: config.summaryMode }),
  })
}
