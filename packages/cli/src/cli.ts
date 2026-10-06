#!/usr/bin/env node
/**
 * codei CLI — entry point
 *
 * Commands:
 *   codei index [path]    — build full index
 *   codei query "<text>"  — query index, get context
 *   codei update [path]   — incremental update
 *   codei status [path]   — show index health
 *   codei serve [path]    — HTTP server for IDE integration
 */

import "dotenv/config"
import { Command } from "commander"
import { registerIndexCommand } from "./commands/index.js"
import { registerQueryCommand } from "./commands/query.js"
import { registerUpdateCommand } from "./commands/update.js"
import { registerStatusCommand } from "./commands/status.js"
import { registerServeCommand } from "./commands/serve.js"
import { registerInitCommand } from "./commands/init.js"
import { registerSetupCommand } from "./commands/setup.js"
import { registerDoctorCommand } from "./commands/doctor.js"
import { registerMcpCommand } from "./commands/mcp.js"
import { registerStatsCommand } from "./commands/stats.js"

const program = new Command()

program
  .name("codei")
  .description(
    "Vectorless, reasoning-based code index for AI context retrieval.\n" +
    "Reduces token usage from 50k+ to ~1-3k per query."
  )
  .version("0.1.0")

registerSetupCommand(program)
registerInitCommand(program)
registerIndexCommand(program)
registerQueryCommand(program)
registerUpdateCommand(program)
registerStatusCommand(program)
registerServeCommand(program)
registerDoctorCommand(program)
registerMcpCommand(program)
registerStatsCommand(program)

program.parse()
