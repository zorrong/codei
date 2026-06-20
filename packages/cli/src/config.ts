/**
 * Config loader — đọc config từ:
 * 1. .codeindex.json trong project root
 * 2. Environment variables
 * 3. CLI flags (highest priority)
 */

import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import { parse as parseDotenv } from "dotenv"

export interface CodeIndexConfig {
  /** LLM provider: openai | anthropic | google | nvidia | custom | ollama */
  provider: "openai" | "anthropic" | "google" | "nvidia" | "custom" | "ollama"
  /** Model name */
  model: string
  /** API key (từ env var hoặc global config) */
  apiKey: string
  /** Custom base URL cho openai-compatible endpoints */
  baseURL?: string
  /** Output dir cho index files */
  indexDir: string
  /** Project name hiển thị trong index */
  projectName?: string
  /** Verbose logging */
  verbose: boolean
  /** HTTP server API key (optional). If set, /query, /status, /update require auth. */
  serverApiKey?: string
  /** CORS allow-origin value for HTTP server responses (default: "*") */
  serverCorsOrigin?: string
  /** Max request body size for HTTP server (bytes). */
  serverMaxBodyBytes?: number
  /** Simple per-IP rate limit per minute for HTTP server. */
  serverRateLimitPerMinute?: number
}

const CONFIG_FILE = ".codeindex.json"
const DOTENV_FILE = ".env"
const GLOBAL_CONFIG_DIR = path.join(os.homedir(), ".codeindex")
const GLOBAL_CONFIG_FILE = path.join(GLOBAL_CONFIG_DIR, "config.json")

const PROVIDER_DEFAULTS: Record<string, Partial<CodeIndexConfig>> = {
  openai: { model: "gpt-4o" },
  anthropic: { model: "claude-sonnet-4-5" },
  google: { model: "gemini-1.5-flash" },
  nvidia: {
    model: "minimaxai/minimax-m3",
    baseURL: "https://integrate.api.nvidia.com/v1",
  },
  custom: { model: "gpt-4o-compatible" },
  ollama: { model: "llama3.2", baseURL: "http://localhost:11434/v1" },
}

function mergeExisting(target: any, source: any) {
  for (const key in source) {
    if (source[key] !== undefined) {
      target[key] = source[key]
    }
  }
  return target
}

function loadProjectEnv(projectRoot: string): Record<string, string> {
  const envPath = path.join(projectRoot, DOTENV_FILE)
  if (!fs.existsSync(envPath)) return {}

  try {
    return parseDotenv(fs.readFileSync(envPath, "utf-8"))
  } catch {
    return {}
  }
}

function inferProviderFromEnv(
  env: Record<string, string>,
  fallback: CodeIndexConfig["provider"]
): CodeIndexConfig["provider"] {
  const explicitProvider = env["CODEINDEX_PROVIDER"] as CodeIndexConfig["provider"] | undefined
  if (explicitProvider) return explicitProvider

  const baseURL = env["CODEINDEX_BASE_URL"]?.trim().toLowerCase()
  if (env["NVIDIA_API_KEY"] || baseURL?.includes("integrate.api.nvidia.com")) return "nvidia"
  if (env["ANTHROPIC_API_KEY"]) return "anthropic"
  if (env["GOOGLE_API_KEY"]) return "google"
  if (env["CUSTOM_API_KEY"]) return "custom"
  if (env["OPENAI_API_KEY"]) return "openai"

  return fallback
}

export function loadConfig(
  projectRoot: string,
  overrides: Partial<CodeIndexConfig> = {}
): CodeIndexConfig {
  // Base defaults
  const merged: CodeIndexConfig = {
    provider: "openai",
    model: "gpt-4o",
    apiKey: "",
    indexDir: ".index",
    verbose: false,
  }

  // 1. Load từ global config (~/.codeindex/config.json)
  if (fs.existsSync(GLOBAL_CONFIG_FILE)) {
    try {
      const globalConfig = JSON.parse(fs.readFileSync(GLOBAL_CONFIG_FILE, "utf-8"))
      mergeExisting(merged, globalConfig)
    } catch {}
  }

  // 2. Load từ .codeindex.json nếu có
  const configFile = path.join(projectRoot, CONFIG_FILE)
  if (fs.existsSync(configFile)) {
    try {
      const fileConfig = JSON.parse(fs.readFileSync(configFile, "utf-8"))
      
      // Nếu có provider mới trong file, áp dụng defaults của provider đó trước
      if (fileConfig.provider && fileConfig.provider !== merged.provider) {
        mergeExisting(merged, PROVIDER_DEFAULTS[fileConfig.provider] || {})
      }
      
      mergeExisting(merged, fileConfig)
    } catch {
      console.warn(`[codeindex] Warning: could not parse ${CONFIG_FILE}`)
    }
  }

  // 3. Load từ .env trong project root
  const projectEnv = loadProjectEnv(projectRoot)
  const envConfig: Partial<CodeIndexConfig> = {}
  const inferredProjectProvider = inferProviderFromEnv(projectEnv, merged.provider)
  if (inferredProjectProvider !== merged.provider) {
    mergeExisting(merged, PROVIDER_DEFAULTS[inferredProjectProvider] || {})
    envConfig.provider = inferredProjectProvider
  }
  const effectiveProvider = envConfig.provider ?? merged.provider
  const providerEnvMap: Record<CodeIndexConfig["provider"], string | undefined> = {
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    google: "GOOGLE_API_KEY",
    nvidia: "NVIDIA_API_KEY",
    custom: "CUSTOM_API_KEY",
    ollama: undefined,
  }
  const explicitApiKey = projectEnv["CODEINDEX_API_KEY"]
  const providerApiKeyEnv = providerEnvMap[effectiveProvider]
  if (explicitApiKey) {
    envConfig.apiKey = explicitApiKey
  } else if (providerApiKeyEnv && projectEnv[providerApiKeyEnv]) {
    envConfig.apiKey = projectEnv[providerApiKeyEnv]
  }
  if (projectEnv["CODEINDEX_MODEL"]) envConfig.model = projectEnv["CODEINDEX_MODEL"]
  if (projectEnv["CODEINDEX_BASE_URL"]) envConfig.baseURL = projectEnv["CODEINDEX_BASE_URL"]
  if (projectEnv["CODEINDEX_SERVER_API_KEY"]) envConfig.serverApiKey = projectEnv["CODEINDEX_SERVER_API_KEY"]
  if (projectEnv["CODEINDEX_SERVER_CORS_ORIGIN"]) envConfig.serverCorsOrigin = projectEnv["CODEINDEX_SERVER_CORS_ORIGIN"]
  if (projectEnv["CODEINDEX_SERVER_MAX_BODY_BYTES"]) {
    const v = parseInt(projectEnv["CODEINDEX_SERVER_MAX_BODY_BYTES"], 10)
    if (Number.isFinite(v)) envConfig.serverMaxBodyBytes = v
  }
  if (projectEnv["CODEINDEX_SERVER_RATE_LIMIT_PER_MINUTE"]) {
    const v = parseInt(projectEnv["CODEINDEX_SERVER_RATE_LIMIT_PER_MINUTE"], 10)
    if (Number.isFinite(v)) envConfig.serverRateLimitPerMinute = v
  }
  mergeExisting(merged, envConfig)

  // 4. Load từ process.env (ưu tiên hơn .env)
  const processEnvConfig: Partial<CodeIndexConfig> = {}
  const processEnvRecord = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  )
  const inferredProcessProvider = inferProviderFromEnv(processEnvRecord, merged.provider)
  if (inferredProcessProvider !== merged.provider) {
    mergeExisting(merged, PROVIDER_DEFAULTS[inferredProcessProvider] || {})
    processEnvConfig.provider = inferredProcessProvider
  }
  const processEffectiveProvider = processEnvConfig.provider ?? merged.provider
  const processExplicitApiKey = process.env["CODEINDEX_API_KEY"]
  const processProviderApiKeyEnv = providerEnvMap[processEffectiveProvider]
  if (processExplicitApiKey) {
    processEnvConfig.apiKey = processExplicitApiKey
  } else if (processProviderApiKeyEnv && process.env[processProviderApiKeyEnv]) {
    processEnvConfig.apiKey = process.env[processProviderApiKeyEnv]
  }
  if (process.env["CODEINDEX_MODEL"]) processEnvConfig.model = process.env["CODEINDEX_MODEL"]
  if (process.env["CODEINDEX_BASE_URL"]) processEnvConfig.baseURL = process.env["CODEINDEX_BASE_URL"]
  if (process.env["CODEINDEX_SERVER_API_KEY"]) processEnvConfig.serverApiKey = process.env["CODEINDEX_SERVER_API_KEY"]
  if (process.env["CODEINDEX_SERVER_CORS_ORIGIN"]) processEnvConfig.serverCorsOrigin = process.env["CODEINDEX_SERVER_CORS_ORIGIN"]
  if (process.env["CODEINDEX_SERVER_MAX_BODY_BYTES"]) {
    const v = parseInt(process.env["CODEINDEX_SERVER_MAX_BODY_BYTES"], 10)
    if (Number.isFinite(v)) processEnvConfig.serverMaxBodyBytes = v
  }
  if (process.env["CODEINDEX_SERVER_RATE_LIMIT_PER_MINUTE"]) {
    const v = parseInt(process.env["CODEINDEX_SERVER_RATE_LIMIT_PER_MINUTE"], 10)
    if (Number.isFinite(v)) processEnvConfig.serverRateLimitPerMinute = v
  }
  mergeExisting(merged, processEnvConfig)

  // 5. CLI overrides
  mergeExisting(merged, overrides)

  return merged
}

export function saveGlobalConfig(config: Partial<CodeIndexConfig>): void {
  if (!fs.existsSync(GLOBAL_CONFIG_DIR)) {
    fs.mkdirSync(GLOBAL_CONFIG_DIR, { recursive: true })
  }
  
  let current: Partial<CodeIndexConfig> = {}
  if (fs.existsSync(GLOBAL_CONFIG_FILE)) {
    try {
      current = JSON.parse(fs.readFileSync(GLOBAL_CONFIG_FILE, "utf-8"))
    } catch {}
  }

  const updated = { ...current, ...config }
  fs.writeFileSync(GLOBAL_CONFIG_FILE, JSON.stringify(updated, null, 2), "utf-8")
}

export function resolveApiKey(config: CodeIndexConfig): string {
  // Ollama không cần key
  if (config.provider === "ollama") return "ollama"

  if (config.apiKey) return config.apiKey

  // Try provider-specific env vars
  const envMap: Record<string, string> = {
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    google: "GOOGLE_API_KEY",
    nvidia: "NVIDIA_API_KEY",
    custom: "CUSTOM_API_KEY",
  }

  const envVar = envMap[config.provider]
  if (envVar) {
    const key = process.env[envVar]
    if (key) return key
  }

  throw new Error(
    `No API key found for provider "${config.provider}". ` +
    `Set ${envMap[config.provider] ?? "OPENAI_API_KEY"} environment variable ` +
    `or add "apiKey" to .codeindex.json`
  )
}
