# API Reference

> Brand note: `codei` is the new product and CLI name for `Codeindex`. The `i` stands for both `index` and `intelligent` context retrieval. The published CLI package is `@pnftrading/codei`, while the core and adapter packages are published under `@pnftrading/codei-*`.

## HTTP Server

Start the server:

```bash
codei serve [path] [options]
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--port, -p` | `3131` | Server port |
| `--host` | `127.0.0.1` | Server host |
| `--api-key` | - | Require API key for endpoints |
| `--cors` | `*` | CORS origin |
| `--rate-limit` | `120` | Requests per minute per IP |

### Example

```bash
codei serve . --port 3131 --host 0.0.0.0 --api-key my-secret-key
```

---

## REST Endpoints

### POST `/query`

Query the index for relevant context.

**Request**

```json
{
  "query": "How does authentication work?",
  "maxTokens": 3000,
  "maxSymbols": 10
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `query` | string | required | Search query |
| `maxTokens` | number | `3000` | Max tokens in response |
| `maxSymbols` | number | `10` | Max symbols to include |

**Response**

```json
{
  "query": "How does authentication work?",
  "estimatedTokens": 1450,
  "traversalPath": ["root-descend [mod:src]", "modules: [mod:auth]", "selected: [file:src/auth/auth.service.ts]"],
  "files": [
    {
      "path": "src/auth/auth.service.ts",
      "symbols": ["AuthService", "login", "refreshToken"]
    }
  ],
  "context": "=== src/auth/auth.service.ts ===\nclass AuthService {\n  async login(credentials) { ... }\n}"
}
```

**With API Key**

```bash
curl -X POST http://localhost:3131/query \
  -H "Content-Type: application/json" \
  -H "X-Codei-Api-Key: your-api-key" \
  -d '{"query": "How does authentication work?"}'
```

---

### POST `/update`

Trigger an incremental index update.

**Request**

```json
{
  "force": false
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `force` | boolean | `false` | Force full rebuild |

**Response**

```json
{
  "upToDate": false,
  "filesUpdated": 3,
  "filesNew": 1,
  "filesDeleted": 0,
  "durationMs": 2340
}
```

**With API Key**

```bash
curl -X POST http://localhost:3131/update \
  -H "X-Codei-Api-Key: your-api-key"
```

---

### GET `/status`

Get index health and statistics.

**Response**

```json
{
  "exists": true,
  "projectName": "my-project",
  "totalFiles": 142,
  "totalSymbols": 892,
  "builtAt": 1699000000000,
  "isStale": false,
  "staleFiles": []
}
```

---

### GET `/health`

Server health check.

**Response**

```json
{
  "status": "ok",
  "uptime": 3600,
  "version": "0.1.0"
}
```

---

## Configuration File

### `.codei.json`

Project-level configuration. Recommended: keep this file minimal and put API/provider settings in the project's `.env`.

```json
{
  "indexDir": ".index",
  "projectName": "my-project",
  "summaryMode": "heuristic",
  "serverApiKey": "optional-api-key",
  "serverCorsOrigin": "*",
  "serverMaxBodyBytes": 1048576,
  "serverRateLimitPerMinute": 120
}
```

`summaryMode` controls how `codei` generates file/module summaries:

| Mode | Behavior | LLM calls during index |
|------|----------|------------------------|
| `heuristic` | Build summaries locally from symbols/imports/exports | 0 |
| `llm` | Use LLM to generate summaries | High |
| `auto` | Heuristic-first, may use LLM in future versions | Low |

Recommended default: `heuristic` (stable and avoids provider rate limits).

### CLI Overrides

You can override `summaryMode` per command:

```bash
codei index . --summary-mode heuristic
codei query "your question" --summary-mode heuristic
codei serve . --summary-mode heuristic
```

You can also inspect and manage caches:

```bash
codei status . --json
codei status . --clear-cache
```

### `.env`

Optional per-project override configuration.

```env
NVIDIA_API_KEY=nvapi-...
CODEI_BASE_URL=https://integrate.api.nvidia.com/v1
# Optional:
# CODEI_PROVIDER=nvidia
# CODEI_MODEL=minimaxai/minimax-m3
```

If `NVIDIA_API_KEY` or the NVIDIA base URL is present, `codei` can infer the NVIDIA provider automatically.

### `~/.codei/.env`

Recommended global runtime configuration when you want to run `codei setup` once and reuse it across all projects.

```env
CODEI_PROVIDER=nvidia
CODEI_API_KEY=nvapi-...
CODEI_MODEL=minimaxai/minimax-m3
CODEI_BASE_URL=https://integrate.api.nvidia.com/v1
```

### `~/.codei/config.json`

Backward-compatible global configuration (also created by `codei setup`).

```json
{
  "provider": "nvidia",
  "model": "minimaxai/minimax-m3",
  "apiKey": "nvapi-...",
  "baseURL": "https://integrate.api.nvidia.com/v1"
}
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `GOOGLE_API_KEY` | Google AI API key |
| `NVIDIA_API_KEY` | NVIDIA API key |
| `CODEI_PROVIDER` | Override default provider |
| `CODEI_MODEL` | Override default model |
| `CODEI_BASE_URL` | Override API base URL |
| `CODEI_API_KEY` | Override API key |

## Index Output Files

When indexing, `codei` writes:

| Path | Description |
|------|-------------|
| `.index/tree.json` | Main tree index |
| `.index/meta.json` | Metadata + git hash map |
| `.index/summaries.json` | File summary cache (reused across index/update) |
| `.index/traversal-cache.json` | Persistent traversal cache for query results |

---

## TypeScript API

### IndexManager

```typescript
import { IndexManager } from "@pnftrading/codei-core"

const manager = new IndexManager({
  projectRoot: "/path/to/project",
  projectName: "my-project",
  llmClient: openAiClient,
  adapters: [typescriptAdapter, pythonAdapter],
  indexDir: ".index",
  verbose: false
})

// Build index
const buildResult = await manager.build()

// Incremental update
const updateResult = await manager.update()

// Watch for changes
manager.watch({
  debounceMs: 500,
  onBatch: (changes) => console.log(changes)
})
```

### TreeTraversal

```typescript
import { TreeTraversal } from "@pnftrading/codei-core"

const traversal = new TreeTraversal({
  tree,
  llmClient,
  maxTokens: 3000,
  maxSymbols: 10
})

const result = await traversal.traverse("How does auth work?")
```

---

## CLI Reference

### `codei setup`

Interactive optional global configuration.

```bash
codei setup
```

### `codei init`

Initialize project in current directory.

```bash
codei init [path]
```

### `codei index`

Build or rebuild index.

```bash
codei index [path] [options]
```

| Option | Description |
|--------|-------------|
| `--verbose, -v` | Verbose output |
| `--force` | Force rebuild |

### `codei query`

Query the index.

```bash
codei query "<text>" [options]
```

| Option | Description |
|--------|-------------|
| `--cwd` | Project directory |
| `--format` | Output format (`text` or `json`) |
| `--max-tokens` | Max tokens |
| `--verbose` | Show traversal path |

### `codei update`

Incremental update.

```bash
codei update [path] [options]
```

| Option | Description |
|--------|-------------|
| `--force` | Force full rebuild |

### `codei status`

Check index health.

```bash
codei status [path]
```

### `codei serve`

Start HTTP server.

```bash
codei serve [path] [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--port, -p` | `3131` | Port |
| `--host` | `127.0.0.1` | Host |
| `--api-key` | - | Require API key |
| `--cors` | `*` | CORS origin |
| `--rate-limit` | `120` | Rate limit |
