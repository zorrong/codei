# pnftrading_codei

**Vectorless, reasoning-based code index for AI context retrieval.**

> Cut your AI coding costs by 95%. `codei` gives AI exactly the context it needs — nothing more.

> Brand note: the product and CLI are now called `codei`. The `i` stands for both `index` and `intelligent` context retrieval. The published CLI package is `pnftrading_codei`, while the core and adapter packages are published under `pnftrading_codei-*`.
> npm package: https://www.npmjs.com/package/pnftrading_codei
> Current npm release: `pnftrading_codei@0.1.2`

## Quick Start

```bash
# Install
npm install -g pnftrading_codei

# Setup once globally
codei setup

# Initialize your project and generate AI agent rules
cd your-project
codei init --agent all

# Build the index
codei index .

# Query!
codei query "How does authentication work?"
```

The package installs both command aliases: `codei` and `codeindex`. `codei init --agent all` creates project rule files for Codex, Claude Code, Cursor, Windsurf, and Antigravity-style IDEs without overwriting existing files.

## Commands

| Command | Description |
|---------|-------------|
| `codei setup` | Global runtime configuration (recommended) |
| `codei init [path]` | Initialize project |
| `codei init --agent all` | Initialize project and generate AI agent rule files |
| `codei index [path]` | Build/rebuild index |
| `codei query "<text>"` | Query the index |
| `codei update [path]` | Incremental update |
| `codei status [path]` | Check index health |
| `codei serve [path]` | HTTP server for IDE integration |

## Global Config

```env
CODEI_PROVIDER=nvidia
CODEI_API_KEY=nvapi-...
CODEI_MODEL=minimaxai/minimax-m3
CODEI_BASE_URL=https://integrate.api.nvidia.com/v1
```

`codei setup` writes global config to `~/.codei/config.json` and runtime env to `~/.codei/.env`, so in most cases you only need to configure it once.

## Features

- **Token Efficient** — ~2KB response instead of 50KB+
- **Vectorless** — Uses LLM reasoning, not embeddings
- **Multi-Language** — TypeScript, Python, Go, Rust, Java, C#, C++, PHP, Swift
- **IDE Integration** — HTTP API for VSCode, JetBrains, Neovim, Claude Code

## IDE Integration

### Claude Code
```bash
curl -s -X POST http://localhost:3131/query \
  -d '{"query": "$1", "maxTokens": 3000}' | jq -r '.context'
```

### Cursor / Windsurf
Add to `.cursorrules`:
```
When you need context, run:
  curl -s -X POST http://localhost:3131/query -d '{"query": "YOUR_QUESTION"}'
```

## License

MIT — See [main repo](https://github.com/zorrong/codei)
