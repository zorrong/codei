# codei

**Cut your AI coding costs by 95%. Vectorless code index for intelligent context retrieval.**

> Every time you paste your codebase to ChatGPT or Claude, you're burning tokens. `codei` gives AI exactly the context it needs — nothing more.

> Brand note: `codei` is the new product name for `Codeindex`. The `i` stands for both `index` and `intelligent` context retrieval. The CLI command is `codei`, the npm package is `pnftrading_codei`, and the core/adapter packages are published under `pnftrading_codei-*`.
> npm package: https://www.npmjs.com/package/pnftrading_codei
> Current npm release: `pnftrading_codei@0.1.2`

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

`codei` turns your repository into a compact, queryable map that AI tools can use on demand. Instead of asking an assistant to inspect every file, you build a local index once and let `codei` retrieve the few modules, files, symbols, and dependency signatures that matter for the current question.

The workflow is deliberately simple:

1. `codei index .` scans the project, respects your ignore rules, parses supported languages, and stores a local `.index/` tree.
2. `codei query "<your question>"` uses the index to find the relevant parts of the codebase.
3. The output is already formatted for an AI chat or coding agent, including selected source snippets plus lightweight dependency context.
4. After code changes, `codei update` refreshes the index incrementally so future queries stay current.

This makes `codei` useful as a context layer for Codex, Claude Code, Cursor, Windsurf, Cline, Antigravity, and any agent that can run shell commands or call the local HTTP server. The agent asks `codei` first, then works with targeted context instead of guessing which files to open.

**Result: \~1,000-3,000 tokens per query instead of 50,000+**

```
Before: Paste 200 files (50KB) → Ask "fix my login bug"
After:  Query codei, paste 3 focused files (2KB) → Same answer
```

***

## Why codei?

| <br />           | codei         | Vector Embeddings        | Manual Copy-Paste |
| ---------------- | ------------- | ------------------------ | ----------------- |
| **Tokens/query** | \~2 KB        | \~100 KB                 | 50+ KB            |
| **Setup**        | 2 minutes     | 30 minutes               | 0                 |
| **Accuracy**     | LLM reasoning | Cosine similarity        | You're guessing   |
| **Updates**      | Instant       | Re-embed entire codebase | Manual            |
| **Privacy**      | Local index; provider call only when configured | Data leaves machine | You choose what to paste |
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
npm install -g pnftrading_codei

# 2. Setup once globally
codei setup

# 3. Initialize your project and generate AI agent rules
cd your-project
codei init --agent all

# 4. Build the index
codei index .

# 5. Query!
codei query "How does the auth module work?"
```

The npm package installs both command aliases: `codei` and `codeindex`. `codei init --agent all` creates `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.windsurfrules`, and `.antigravity/rules.md` when they do not already exist.

Global setup is stored under `~/.codei/` and reused for all future projects.

If you prefer env-based global runtime config, `codei setup` also writes `~/.codei/.env`.

For NVIDIA, a minimal global env looks like:

```env
NVIDIA_API_KEY=nvapi-...
CODEI_BASE_URL=https://integrate.api.nvidia.com/v1
```

**That's it.** Run setup once, then `codei index` works across projects.

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
│                    codei Index                              │
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

The simplest integration is now generated by `codei init --agent all`. It adds project-level rule files that tell IDE agents to run `codei query` before answering codebase questions or editing code.

See the full English guide: [docs/IDE-INTEGRATION.md](./docs/IDE-INTEGRATION.md).

Quick rule for Codex, Claude Code, Cursor, Windsurf, Cline, Antigravity, and similar AI IDEs:

```markdown
Before analyzing or editing this repository, run:

codei query "<task-specific question>"

Use the output as the primary code context. After edits, run `codei update`.
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
codei/
├── packages/
│   ├── core/                    # Tree index, retrieval, storage
│   ├── cli/                     # CLI & HTTP server
│   └── adapter-*/               # Language-specific parsers
└── docs/                        # Documentation
```

The index and HTTP server run locally. By default, semantic summaries and query reasoning use your configured LLM provider; use `ollama` for a fully local model path.

***

## Contributing

Contributions welcome! See [docs/](./docs/) for architecture details.

## License

MIT — Use it freely, even in commercial projects.

## Support

If codei saves you time and money, consider buying me a coffee ☕

[![Donate with PayPal](https://img.shields.io/badge/PayPal-zorrong@outlook.com-003087?style=for-the-badge\&logo=paypal)](https://paypal.me/zorrong)

***

**Stop paying for context you don't need. Start using codei.**
