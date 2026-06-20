# API Reference

## HTTP Server

Start the server:

```bash
codeindex serve [path] [options]
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
codeindex serve . --port 3131 --host 0.0.0.0 --api-key my-secret-key
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
  -H "X-API-Key: your-api-key" \
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
  -H "X-API-Key: your-api-key"
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

### `.codeindex.json`

Project-level configuration. Recommended: keep this file minimal and put API/provider settings in the project's `.env`.

```json
{
  "indexDir": ".index",
  "projectName": "my-project",
  "serverApiKey": "optional-api-key",
  "serverCorsOrigin": "*",
  "serverMaxBodyBytes": 1048576,
  "serverRateLimitPerMinute": 120
}
```

### `.env`

Recommended per-project API configuration.

```env
NVIDIA_API_KEY=nvapi-...
CODEINDEX_BASE_URL=https://integrate.api.nvidia.com/v1
# Optional:
# CODEINDEX_PROVIDER=nvidia
# CODEINDEX_MODEL=minimaxai/minimax-m3
```

If `NVIDIA_API_KEY` or the NVIDIA base URL is present, `codeindex` can infer the NVIDIA provider automatically.

### `~/.codeindex/config.json`

Optional global configuration (created by `codeindex setup`).

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
| `CODEINDEX_PROVIDER` | Override default provider |
| `CODEINDEX_MODEL` | Override default model |
| `CODEINDEX_BASE_URL` | Override API base URL |
| `CODEINDEX_API_KEY` | Override API key |

---

## TypeScript API

### IndexManager

```typescript
import { IndexManager } from "@codeindex/core"

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
import { TreeTraversal } from "@codeindex/core"

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

### `codeindex setup`

Interactive optional global configuration.

```bash
codeindex setup
```

### `codeindex init`

Initialize project in current directory.

```bash
codeindex init [path]
```

### `codeindex index`

Build or rebuild index.

```bash
codeindex index [path] [options]
```

| Option | Description |
|--------|-------------|
| `--verbose, -v` | Verbose output |
| `--force` | Force rebuild |

### `codeindex query`

Query the index.

```bash
codeindex query "<text>" [options]
```

| Option | Description |
|--------|-------------|
| `--cwd` | Project directory |
| `--format` | Output format (`text` or `json`) |
| `--max-tokens` | Max tokens |
| `--verbose` | Show traversal path |

### `codeindex update`

Incremental update.

```bash
codeindex update [path] [options]
```

| Option | Description |
|--------|-------------|
| `--force` | Force full rebuild |

### `codeindex status`

Check index health.

```bash
codeindex status [path]
```

### `codeindex serve`

Start HTTP server.

```bash
codeindex serve [path] [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--port, -p` | `3131` | Port |
| `--host` | `127.0.0.1` | Host |
| `--api-key` | - | Require API key |
| `--cors` | `*` | CORS origin |
| `--rate-limit` | `120` | Rate limit |
