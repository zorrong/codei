# codeindex

**Cut your AI coding costs by 95%. Vectorless code index for intelligent context retrieval.**

> Every time you paste your codebase to ChatGPT or Claude, you're burning tokens. `codeindex` gives AI exactly the context it needs — nothing more.

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat\&logo=typescript\&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat\&logo=nodedotjs\&logoColor=white)

***

## The Problem

You're paying **$20-100/month** on AI coding tools, but here's the dirty secret:

| What You're Doing               | What It Costs         |
| ------------------------------- | --------------------- |
| Pasting entire files to ChatGPT | \~50,000 tokens/query |
| Claude analyzing your codebase  | $0.03-0.15/query      |
| Context window overflow errors  | Priceless frustration |

**The average developer wastes 80% of their AI budget on irrelevant context.**

Every `CTRL+C → CTRL+V` to an AI chat burns tokens on code that has nothing to do with your question. You're paying for context soup when you only need one ingredient.

***

## The Solution

`codeindex` builds a **hierarchical tree index** of your codebase. When you ask a question, LLM reasoning selects exactly which modules, files, and symbols are relevant — then returns only that.

**Result: \~1,000-3,000 tokens per query instead of 50,000+**

```
Before: Paste 200 files (50KB) → Ask "fix my login bug"
After:  Paste 3 files (2KB)   → Same answer
```

***

## Why codeindex?

| <br />           | codeindex     | Vector Embeddings        | Manual Copy-Paste |
| ---------------- | ------------- | ------------------------ | ----------------- |
| **Tokens/query** | \~2 KB        | \~100 KB                 | 50+ KB            |
| **Setup**        | 2 minutes     | 30 minutes               | 0                 |
| **Accuracy**     | LLM reasoning | Cosine similarity        | You're guessing   |
| **Updates**      | Instant       | Re-embed entire codebase | Manual            |
| **Privacy**      | 100% local    | Data leaves machine      | You're in control |
| **Cost**         | Free (MIT)    | $20-100/month            | Free (wasteful)   |

***

## Features

- **Vectorless Architecture** — No embeddings, no external storage, no recurring costs
- **LLM Reasoning** — Asks "what code is relevant?" instead of "what code is similar?"
- **Multi-Language** — TypeScript, Python, Go, Rust, Java, C#, C++, PHP, Swift
- **Incremental Updates** — Only re-indexes changed files
- **IDE Integration** — HTTP API for VSCode, JetBrains, Neovim, Claude Code, Cursor
- **Git Hook Ready** — Auto-update index after commits
- **Production Ready** — API key auth, rate limiting, structured logging

***

## Quick Start

```bash
# 1. Install
pnpm install -g @codeindex/cli

# 2. Setup once globally
codeindex setup

# 3. Index your project
cd your-project
codeindex index .

# 4. Query!cd 
codeindex query "How does the auth module work?"
```

Global setup is stored under `~/.codeindex/` and reused for all future projects.

If you prefer env-based global runtime config, `codeindex setup` also writes `~/.codeindex/.env`.

For NVIDIA, a minimal global env looks like:

```env
NVIDIA_API_KEY=nvapi-...
CODEINDEX_BASE_URL=https://integrate.api.nvidia.com/v1
```

**That's it.** Run setup once, then `codeindex index` works across projects.

***

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                        Your Query                            │
│              "How does auth validation work?"              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    codeindex Index                          │
│                                                             │
│   Project                                                    │
│   └── src/                                                   │
│       ├── auth/              ← LLM selects this module     │
│       │   ├── login.ts       ← And these files             │
│       │   └── validators.ts                                    │
│       └── users/                                              │
│           └── ...                                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Response                               │
│                                                             │
│   auth/validators.ts + auth/login.ts (2KB)                  │
│   "Here are the validation functions..."                     │
└─────────────────────────────────────────────────────────────┘
```

***

## Token Savings

| Project Size | Before           | After        | You Save        |
| ------------ | ---------------- | ------------ | --------------- |
| 50 files     | 15,000 tokens    | 800 tokens   | **$0.05/query** |
| 200 files    | 60,000 tokens    | 1,500 tokens | **$0.15/query** |
| 500+ files   | Context overflow | 2,500 tokens | **Priceless**   |

At 10 queries/day, that's **$15-45/month** saved.

***

## IDE Integrations

### Claude Code

```bash
# Add to ~/.claude/tools/codeindex.sh
curl -s -X POST http://localhost:3131/query \
  -d '{"query": "$1", "maxTokens": 3000}' | jq -r '.context'
```

### Cursor / Windsurf

Add to your `.cursorrules`:

```
When you need codebase context, run:
  curl -s -X POST http://localhost:3131/query -d '{"query": "YOUR_QUESTION"}' | jq -r '.context'
```

### VSCode (Cline)

```
Use codeindex query "your question" to get relevant code context.
Start server: codeindex serve . --port 3131
```

***

## Supported Languages

TypeScript • Python • Go • Rust • Java • C# • C++ • PHP • Swift

*Multi-language support is built-in. Each language is handled by its own dedicated adapter.*

***

## Testing

Run all tests across the workspace:

```bash
pnpm test          # Run all tests
pnpm test:watch    # Run in watch mode
```

## Releasing

```bash
pnpm changeset
pnpm run version-packages
pnpm run release:check
pnpm run release:publish:dry-run
```

See [docs/RELEASING.md](./docs/RELEASING.md) for the full npm release workflow.

***

## Architecture

```
codeindex/
├── packages/
│   ├── core/                    # Tree index, retrieval, storage
│   ├── cli/                     # CLI & HTTP server
│   └── adapter-*/               # Language-specific parsers
└── docs/                        # Documentation
```

**No external dependencies.** Everything runs locally.

***

## Contributing

Contributions welcome! See [docs/](./docs/) for architecture details.

## License

MIT — Use it freely, even in commercial projects.

## Support

If codeindex saves you time and money, consider buying me a coffee ☕

[![Donate with PayPal](https://img.shields.io/badge/PayPal-zorrong@outlook.com-003087?style=for-the-badge\&logo=paypal)](https://paypal.me/zorrong)

***

**Stop paying for context you don't need. Start using codeindex.**
