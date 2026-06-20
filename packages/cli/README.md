# @codeindex/cli

**Vectorless, reasoning-based code index for AI context retrieval.**

> Cut your AI coding costs by 95%. `codeindex` gives AI exactly the context it needs — nothing more.

## Quick Start

```bash
# Install
npm install -g @codeindex/cli

# Setup once globally
codeindex setup

# Index your project
cd your-project
codeindex index .

# Query!
codeindex query "How does authentication work?"
```

## Commands

| Command | Description |
|---------|-------------|
| `codeindex setup` | Global runtime configuration (recommended) |
| `codeindex init [path]` | Initialize project |
| `codeindex index [path]` | Build/rebuild index |
| `codeindex query "<text>"` | Query the index |
| `codeindex update [path]` | Incremental update |
| `codeindex status [path]` | Check index health |
| `codeindex serve [path]` | HTTP server for IDE integration |

## Global Config

```env
CODEINDEX_PROVIDER=nvidia
CODEINDEX_API_KEY=nvapi-...
CODEINDEX_MODEL=minimaxai/minimax-m3
CODEINDEX_BASE_URL=https://integrate.api.nvidia.com/v1
```

`codeindex setup` writes global config to `~/.codeindex/config.json` and `~/.codeindex/.env`, so in most cases you only need to configure it once.

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

MIT — See [main repo](https://github.com/zorrong/codeindex)
