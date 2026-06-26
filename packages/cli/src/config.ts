/**
 * Config loader — global-first:
 * 1. ~/.codeindex/config.json
 * 2. ~/.codeindex/.env
 * 3. project .codeindex.json (local-only fields)
 * 4. project .env
 * 5. process.env
 * 6. CLI flags
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
  summaryMode?: "llm" | "heuristic" | "auto"
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

export interface ConfigFieldSource {
  source: "default" | "global-config" | "global-env" | "project-config" | "project-env" | "process-env" | "cli"
  location: string
  key?: string
}

export interface ConfigDebugInfo {
  projectRoot: string
  globalConfigDir: string
  effective: CodeIndexConfig
  fields: Partial<Record<keyof CodeIndexConfig, ConfigFieldSource>>
}

const CONFIG_FILE = ".codeindex.json"
const DOTENV_FILE = ".env"
const DEFAULT_GLOBAL_CONFIG_DIR = path.join(os.homedir(), ".codeindex")
const PROJECT_LOCAL_CONFIG_KEYS: Array<keyof CodeIndexConfig> = [
  "indexDir",
  "projectName",
  "summaryMode",
  "verbose",
  "serverApiKey",
  "serverCorsOrigin",
  "serverMaxBodyBytes",
  "serverRateLimitPerMinute",
]
const GLOBAL_RUNTIME_KEYS: Array<keyof CodeIndexConfig> = [
  "provider",
  "model",
  "apiKey",
  "baseURL",
]

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

function getGlobalConfigDir(): string {
  return process.env["CODEINDEX_GLOBAL_DIR"]?.trim() || DEFAULT_GLOBAL_CONFIG_DIR
}

function getGlobalConfigFile(): string {
  return path.join(getGlobalConfigDir(), "config.json")
}

function getGlobalEnvFile(): string {
  return path.join(getGlobalConfigDir(), DOTENV_FILE)
}

function stripKeys<T extends Record<string, unknown>, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const clone = { ...obj }
  for (const key of keys) {
    delete clone[key]
  }
  return clone
}

function loadEnvFile(envPath: string): Record<string, string> {
  if (!fs.existsSync(envPath)) return {}

  try {
    return parseDotenv(fs.readFileSync(envPath, "utf-8"))
  } catch {
    return {}
  }
}

function loadProjectEnv(projectRoot: string): Record<string, string> {
  return loadEnvFile(path.join(projectRoot, DOTENV_FILE))
}

function loadGlobalEnv(): Record<string, string> {
  return loadEnvFile(getGlobalEnvFile())
}

function readGlobalConfigFile(): Partial<CodeIndexConfig> {
  const globalConfigFile = getGlobalConfigFile()
  if (!fs.existsSync(globalConfigFile)) return {}

  try {
    return JSON.parse(fs.readFileSync(globalConfigFile, "utf-8")) as Partial<CodeIndexConfig>
  } catch {
    return {}
  }
}

function getProviderApiKeyEnvMap(): Record<CodeIndexConfig["provider"], string | undefined> {
  return {
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    google: "GOOGLE_API_KEY",
    nvidia: "NVIDIA_API_KEY",
    custom: "CUSTOM_API_KEY",
    ollama: undefined,
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

function extractEnvConfig(
  env: Record<string, string>,
  fallbackProvider: CodeIndexConfig["provider"]
): {
  config: Partial<CodeIndexConfig>
  fieldKeys: Partial<Record<keyof CodeIndexConfig, string>>
} {
  const config: Partial<CodeIndexConfig> = {}
  const fieldKeys: Partial<Record<keyof CodeIndexConfig, string>> = {}

  if (Object.keys(env).length === 0) {
    return { config, fieldKeys }
  }

  const explicitProvider = env["CODEINDEX_PROVIDER"] as CodeIndexConfig["provider"] | undefined
  const baseURL = env["CODEINDEX_BASE_URL"]?.trim().toLowerCase()
  let effectiveProvider = fallbackProvider

  if (explicitProvider) {
    effectiveProvider = explicitProvider
    config.provider = explicitProvider
    fieldKeys.provider = "CODEINDEX_PROVIDER"
  } else if (env["NVIDIA_API_KEY"] || baseURL?.includes("integrate.api.nvidia.com")) {
    effectiveProvider = "nvidia"
    if (effectiveProvider !== fallbackProvider) {
      config.provider = effectiveProvider
      fieldKeys.provider = env["NVIDIA_API_KEY"] ? "NVIDIA_API_KEY" : "CODEINDEX_BASE_URL"
    }
  } else if (env["ANTHROPIC_API_KEY"]) {
    effectiveProvider = "anthropic"
    if (effectiveProvider !== fallbackProvider) {
      config.provider = effectiveProvider
      fieldKeys.provider = "ANTHROPIC_API_KEY"
    }
  } else if (env["GOOGLE_API_KEY"]) {
    effectiveProvider = "google"
    if (effectiveProvider !== fallbackProvider) {
      config.provider = effectiveProvider
      fieldKeys.provider = "GOOGLE_API_KEY"
    }
  } else if (env["CUSTOM_API_KEY"]) {
    effectiveProvider = "custom"
    if (effectiveProvider !== fallbackProvider) {
      config.provider = effectiveProvider
      fieldKeys.provider = "CUSTOM_API_KEY"
    }
  } else if (env["OPENAI_API_KEY"]) {
    effectiveProvider = "openai"
    if (effectiveProvider !== fallbackProvider) {
      config.provider = effectiveProvider
      fieldKeys.provider = "OPENAI_API_KEY"
    }
  }

  const providerApiKeyEnv = getProviderApiKeyEnvMap()[effectiveProvider]
  if (env["CODEINDEX_API_KEY"]) {
    config.apiKey = env["CODEINDEX_API_KEY"]
    fieldKeys.apiKey = "CODEINDEX_API_KEY"
  } else if (providerApiKeyEnv && env[providerApiKeyEnv]) {
    config.apiKey = env[providerApiKeyEnv]
    fieldKeys.apiKey = providerApiKeyEnv
  }

  if (env["CODEINDEX_MODEL"]) {
    config.model = env["CODEINDEX_MODEL"]
    fieldKeys.model = "CODEINDEX_MODEL"
  }
  if (env["CODEINDEX_BASE_URL"]) {
    config.baseURL = env["CODEINDEX_BASE_URL"]
    fieldKeys.baseURL = "CODEINDEX_BASE_URL"
  }
  if (env["CODEINDEX_SERVER_API_KEY"]) {
    config.serverApiKey = env["CODEINDEX_SERVER_API_KEY"]
    fieldKeys.serverApiKey = "CODEINDEX_SERVER_API_KEY"
  }
  if (env["CODEINDEX_SERVER_CORS_ORIGIN"]) {
    config.serverCorsOrigin = env["CODEINDEX_SERVER_CORS_ORIGIN"]
    fieldKeys.serverCorsOrigin = "CODEINDEX_SERVER_CORS_ORIGIN"
  }

  if (env["CODEINDEX_SERVER_MAX_BODY_BYTES"]) {
    const v = parseInt(env["CODEINDEX_SERVER_MAX_BODY_BYTES"], 10)
    if (Number.isFinite(v)) {
      config.serverMaxBodyBytes = v
      fieldKeys.serverMaxBodyBytes = "CODEINDEX_SERVER_MAX_BODY_BYTES"
    }
  }

  if (env["CODEINDEX_SERVER_RATE_LIMIT_PER_MINUTE"]) {
    const v = parseInt(env["CODEINDEX_SERVER_RATE_LIMIT_PER_MINUTE"], 10)
    if (Number.isFinite(v)) {
      config.serverRateLimitPerMinute = v
      fieldKeys.serverRateLimitPerMinute = "CODEINDEX_SERVER_RATE_LIMIT_PER_MINUTE"
    }
  }

  return { config, fieldKeys }
}

function applyEnvConfig(merged: CodeIndexConfig, env: Record<string, string>): void {
  if (Object.keys(env).length === 0) return

  const inferredProvider = inferProviderFromEnv(env, merged.provider)
  if (inferredProvider !== merged.provider) {
    mergeExisting(merged, PROVIDER_DEFAULTS[inferredProvider] || {})
    merged.provider = inferredProvider
  }

  const { config } = extractEnvConfig(env, merged.provider)
  mergeExisting(merged, config)
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
    summaryMode: "heuristic",
    verbose: false,
  }

  const globalConfig = readGlobalConfigFile()
  let globalEnv = loadGlobalEnv()

  // Tự migrate config toàn cục cũ sang ~/.codeindex/.env để lần sau dùng ổn định.
  if (Object.keys(globalEnv).length === 0 && Object.keys(globalConfig).length > 0) {
    const legacyRuntimeConfig = Object.fromEntries(
      Object.entries(globalConfig).filter(([key]) => GLOBAL_RUNTIME_KEYS.includes(key as keyof CodeIndexConfig))
    ) as Partial<CodeIndexConfig>

    if (Object.keys(legacyRuntimeConfig).length > 0) {
      saveGlobalEnv(legacyRuntimeConfig)
      globalEnv = loadGlobalEnv()
    }
  }

  // 1. Load từ global config (~/.codeindex/config.json), nhưng nếu đã có ~/.codeindex/.env
  // thì bỏ qua runtime keys cũ để .env làm source of truth.
  const effectiveGlobalConfig = Object.keys(globalEnv).length > 0
    ? stripKeys(globalConfig, GLOBAL_RUNTIME_KEYS)
    : globalConfig
  mergeExisting(merged, effectiveGlobalConfig)

  // 2. Load từ global .env (~/.codeindex/.env)
  applyEnvConfig(merged, globalEnv)

  // 3. Load từ .codeindex.json nếu có (local-only keys)
  const configFile = path.join(projectRoot, CONFIG_FILE)
  if (fs.existsSync(configFile)) {
    try {
      const fileConfig = JSON.parse(fs.readFileSync(configFile, "utf-8"))

      const localConfig = Object.fromEntries(
        Object.entries(fileConfig).filter(([key]) =>
          PROJECT_LOCAL_CONFIG_KEYS.includes(key as keyof CodeIndexConfig)
        )
      )

      mergeExisting(merged, localConfig)
    } catch {
      console.warn(`[codeindex] Warning: could not parse ${CONFIG_FILE}`)
    }
  }

  // 4. Load từ .env trong project root (optional per-project override)
  applyEnvConfig(merged, loadProjectEnv(projectRoot))

  // 5. Load từ process.env (ưu tiên hơn .env files)
  applyEnvConfig(
    merged,
    Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  )
  )

  // 6. CLI overrides
  mergeExisting(merged, overrides)

  return merged
}

export function inspectConfig(
  projectRoot: string,
  overrides: Partial<CodeIndexConfig> = {}
): ConfigDebugInfo {
  const globalConfig = readGlobalConfigFile()
  let globalEnv = loadGlobalEnv()
  if (Object.keys(globalEnv).length === 0 && Object.keys(globalConfig).length > 0) {
    const legacyRuntimeConfig = Object.fromEntries(
      Object.entries(globalConfig).filter(([key]) => GLOBAL_RUNTIME_KEYS.includes(key as keyof CodeIndexConfig))
    ) as Partial<CodeIndexConfig>
    if (Object.keys(legacyRuntimeConfig).length > 0) {
      saveGlobalEnv(legacyRuntimeConfig)
      globalEnv = loadGlobalEnv()
    }
  }

  const effective = loadConfig(projectRoot, overrides)
  const working: CodeIndexConfig = {
    provider: "openai",
    model: "gpt-4o",
    apiKey: "",
    indexDir: ".index",
    summaryMode: "heuristic",
    verbose: false,
  }

  const fields: Partial<Record<keyof CodeIndexConfig, ConfigFieldSource>> = {
    provider: { source: "default", location: "built-in defaults" },
    model: { source: "default", location: "built-in defaults" },
    apiKey: { source: "default", location: "built-in defaults" },
    indexDir: { source: "default", location: "built-in defaults" },
    summaryMode: { source: "default", location: "built-in defaults" },
    verbose: { source: "default", location: "built-in defaults" },
  }

  const assignTracked = (
    patch: Partial<CodeIndexConfig>,
    source: ConfigFieldSource["source"],
    location: string,
    keys: Partial<Record<keyof CodeIndexConfig, string>> = {}
  ) => {
    for (const [key, value] of Object.entries(patch) as Array<[keyof CodeIndexConfig, CodeIndexConfig[keyof CodeIndexConfig]]>) {
      if (value === undefined) continue
      working[key] = value as never
      fields[key] = {
        source,
        location,
        ...(keys[key] !== undefined && { key: keys[key] }),
      }
    }
  }

  const globalConfigFile = getGlobalConfigFile()
  const effectiveGlobalConfig = Object.keys(globalEnv).length > 0
    ? stripKeys(globalConfig, GLOBAL_RUNTIME_KEYS)
    : globalConfig
  assignTracked(effectiveGlobalConfig, "global-config", globalConfigFile)

  const globalEnvFile = getGlobalEnvFile()
  if (Object.keys(globalEnv).length > 0) {
    const inferredProvider = inferProviderFromEnv(globalEnv, working.provider)
    if (inferredProvider !== working.provider) {
      assignTracked(PROVIDER_DEFAULTS[inferredProvider] || {}, "global-env", globalEnvFile)
      working.provider = inferredProvider
      fields.provider = {
        source: "global-env",
        location: globalEnvFile,
        key: extractEnvConfig(globalEnv, working.provider).fieldKeys.provider,
      }
    }
    const extracted = extractEnvConfig(globalEnv, working.provider)
    assignTracked(extracted.config, "global-env", globalEnvFile, extracted.fieldKeys)
  }

  const projectConfigFile = path.join(projectRoot, CONFIG_FILE)
  if (fs.existsSync(projectConfigFile)) {
    try {
      const fileConfig = JSON.parse(fs.readFileSync(projectConfigFile, "utf-8"))
      const localConfig = Object.fromEntries(
        Object.entries(fileConfig).filter(([key]) =>
          PROJECT_LOCAL_CONFIG_KEYS.includes(key as keyof CodeIndexConfig)
        )
      ) as Partial<CodeIndexConfig>
      assignTracked(localConfig, "project-config", projectConfigFile)
    } catch {}
  }

  const projectEnvFile = path.join(projectRoot, DOTENV_FILE)
  const projectEnv = loadProjectEnv(projectRoot)
  if (Object.keys(projectEnv).length > 0) {
    const inferredProvider = inferProviderFromEnv(projectEnv, working.provider)
    if (inferredProvider !== working.provider) {
      assignTracked(PROVIDER_DEFAULTS[inferredProvider] || {}, "project-env", projectEnvFile)
      working.provider = inferredProvider
    }
    const extracted = extractEnvConfig(projectEnv, working.provider)
    assignTracked(extracted.config, "project-env", projectEnvFile, extracted.fieldKeys)
  }

  const processEnvRecord = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  )
  if (Object.keys(processEnvRecord).length > 0) {
    const inferredProvider = inferProviderFromEnv(processEnvRecord, working.provider)
    if (inferredProvider !== working.provider) {
      assignTracked(PROVIDER_DEFAULTS[inferredProvider] || {}, "process-env", "process.env")
      working.provider = inferredProvider
    }
    const extracted = extractEnvConfig(processEnvRecord, working.provider)
    assignTracked(extracted.config, "process-env", "process.env", extracted.fieldKeys)
  }

  assignTracked(overrides, "cli", "CLI flags")

  return {
    projectRoot,
    globalConfigDir: getGlobalConfigDir(),
    effective,
    fields,
  }
}

export function saveGlobalConfig(config: Partial<CodeIndexConfig>): void {
  const globalConfigDir = getGlobalConfigDir()
  const globalConfigFile = getGlobalConfigFile()

  if (!fs.existsSync(globalConfigDir)) {
    fs.mkdirSync(globalConfigDir, { recursive: true })
  }
  
  let current: Partial<CodeIndexConfig> = {}
  if (fs.existsSync(globalConfigFile)) {
    try {
      current = JSON.parse(fs.readFileSync(globalConfigFile, "utf-8"))
    } catch {}
  }

  const updated = { ...current, ...config }
  fs.writeFileSync(globalConfigFile, JSON.stringify(updated, null, 2), "utf-8")
}

function formatEnvValue(value: string): string {
  return /[\s#"'`]/.test(value) ? JSON.stringify(value) : value
}

export function saveGlobalEnv(config: Partial<CodeIndexConfig>): void {
  const globalConfigDir = getGlobalConfigDir()
  const globalEnvFile = getGlobalEnvFile()

  if (!fs.existsSync(globalConfigDir)) {
    fs.mkdirSync(globalConfigDir, { recursive: true })
  }

  const lines = [
    "# codeindex global runtime config",
  ]

  if (config.provider) lines.push(`CODEINDEX_PROVIDER=${formatEnvValue(config.provider)}`)
  if (config.model) lines.push(`CODEINDEX_MODEL=${formatEnvValue(config.model)}`)
  if (config.baseURL) lines.push(`CODEINDEX_BASE_URL=${formatEnvValue(config.baseURL)}`)
  if (config.apiKey && config.provider !== "ollama") {
    lines.push(`CODEINDEX_API_KEY=${formatEnvValue(config.apiKey)}`)
  }

  fs.writeFileSync(globalEnvFile, lines.join("\n") + "\n", "utf-8")
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
