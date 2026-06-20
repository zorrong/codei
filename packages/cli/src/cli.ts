#!/usr/bin/env node
/**
 * codeindex CLI — entry point
 *
 * Commands:
 *   codeindex index [path]    — build full index
 *   codeindex query "<text>"  — query index, get context
 *   codeindex update [path]   — incremental update
 *   codeindex status [path]   — show index health
 *   codeindex serve [path]    — HTTP server for IDE integration
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

const program = new Command()

program
  .name("codeindex")
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

program.parse()
