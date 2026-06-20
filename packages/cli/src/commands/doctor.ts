import type { Command } from "commander"
import * as path from "path"
import { type CodeIndexConfig, inspectConfig, resolveApiKey } from "../config.js"

function formatValue(key: keyof CodeIndexConfig, value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return "(unset)"
  }
  if (key === "apiKey" || key === "serverApiKey") {
    return "(set)"
  }
  return String(value)
}

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor [path]")
    .description("Hiển thị config hiệu lực và nguồn cấu hình đang được dùng")
    .option("--provider <provider>", "Override provider khi kiểm tra")
    .option("--model <model>", "Override model khi kiểm tra")
    .option("--index-dir <dir>", "Override index dir khi kiểm tra")
    .option("--json", "Output as JSON")
    .action((targetPath: string | undefined, options: Record<string, string | boolean>) => {
      const projectRoot = path.resolve(targetPath ?? ".")

      const overrides: Partial<CodeIndexConfig> = {}
      if (options["provider"]) overrides.provider = options["provider"] as CodeIndexConfig["provider"]
      if (options["model"]) overrides.model = options["model"] as string
      if (options["indexDir"]) overrides.indexDir = options["indexDir"] as string

      const debug = inspectConfig(projectRoot, overrides)

      if (options["json"] === true) {
        let resolvedApiKey = false
        try {
          resolveApiKey(debug.effective)
          resolvedApiKey = true
        } catch {}

        console.log(JSON.stringify({ ...debug, resolvedApiKey }, null, 2))
        return
      }

      console.log(`🩺 codeindex doctor: ${debug.projectRoot}`)
      console.log(`   Global dir : ${debug.globalConfigDir}`)
      console.log("")

      const orderedKeys: Array<keyof CodeIndexConfig> = [
        "provider",
        "model",
        "apiKey",
        "baseURL",
        "indexDir",
        "projectName",
        "verbose",
        "serverApiKey",
        "serverCorsOrigin",
        "serverMaxBodyBytes",
        "serverRateLimitPerMinute",
      ]

      for (const key of orderedKeys) {
        const source = debug.fields[key]
        const value = debug.effective[key]
        console.log(`${key.padEnd(24)} ${formatValue(key, value)}`)
        if (source) {
          const sourceText = source.key ? `${source.source} -> ${source.location} (${source.key})` : `${source.source} -> ${source.location}`
          console.log(`   from                  ${sourceText}`)
        }
      }

      try {
        resolveApiKey(debug.effective)
        console.log("\n✅ API key resolved successfully")
      } catch (error) {
        console.log(`\n❌ API key not resolved: ${(error as Error).message}`)
      }
    })
}
