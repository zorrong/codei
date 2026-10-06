/**
 * `codei stats` — báo cáo tiết kiệm token tích lũy từ query-log.jsonl.
 */

import type { Command } from "commander"
import * as path from "path"
import { loadConfig } from "../config.js"
import { readStats } from "../telemetry.js"

export function registerStatsCommand(program: Command): void {
  program
    .command("stats [path]")
    .description("Báo cáo token đã dùng / tiết kiệm từ lịch sử query")
    .option("--json", "Output as JSON")
    .option("--last <n>", "Chỉ tính N query gần nhất", "0")
    .action(async (targetPath: string | undefined, options: Record<string, string | boolean>) => {
      const projectRoot = path.resolve(targetPath ?? ".")
      const config = loadConfig(projectRoot)
      const last = parseInt(options["last"] as string ?? "0", 10)
      const full = readStats(projectRoot, config.indexDir)
      const entries = last > 0 ? full.entries.slice(-last) : full.entries
      const totalTokens = entries.reduce((s, e) => s + e.estimatedTokens, 0)
      const withSaved = entries.filter((e) => typeof e.savedPct === "number")
      const stats = {
        count: entries.length,
        totalTokens,
        avgTokens: entries.length > 0 ? Math.round(totalTokens / entries.length) : 0,
        avgSavedPct:
          withSaved.length > 0
            ? Math.round(withSaved.reduce((s, e) => s + (e.savedPct ?? 0), 0) / withSaved.length)
            : 0,
      }

      if (options["json"] === true) {
        console.log(JSON.stringify({ ...stats, since: full.since }, null, 2))
        return
      }

      if (stats.count === 0) {
        console.log("Chưa có query nào được log. Chạy `codei query ...` trước.")
        return
      }
      console.log(`📊 Query stats: ${projectRoot}`)
      console.log(`   Queries   : ${stats.count}`)
      console.log(`   Total     : ~${stats.totalTokens} tokens`)
      console.log(`   Avg/query : ~${stats.avgTokens} tokens`)
      console.log(`   Avg saved : ${stats.avgSavedPct}% vs full dump`)
    })
}
