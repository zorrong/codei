# MCP Server

`codei mcp` exposes the index as a [Model Context Protocol](https://modelcontextprotocol.io/) server over stdio. Agents (Claude Code, Cursor, Windsurf) call it as a tool instead of shelling out to the CLI — fewer tokens, fewer parsing errors.

```bash
codei mcp --cwd /path/to/project
```

Print a ready-to-paste client config:

```bash
codei init --mcp
# { "mcpServers": { "codei": { "command": "codei", "args": ["mcp", "--cwd", "/abs/path"] } } }
```

## Tools

### `codei_query`

Query the index, returns formatted code context as text.

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `query` | string | required | Question about the codebase |
| `maxTokens` | number | `4000` | Max context tokens (100–16000) |
| `expandDeps` | boolean | `true` | Include dependency signatures |
| `compact` | boolean | `false` | Strip blank lines + comment-only lines |

The text ends with a footer line:

```
// tokens: ~1943 (saved 75%) | files: src/a.ts, src/b.ts
```

`saved` = context vs full dump of the selected files.

### `codei_update`

Incremental re-index after code changes. Only cache entries touching changed files are invalidated.

```json
{ "upToDate": false, "filesUpdated": 1, "filesNew": 0, "filesDeleted": 0, "cacheInvalidated": 2, "durationMs": 340 }
```

### `codei_status`

Index health + cache stats (`{ exists, totalFiles, totalSymbols, builtAt, isStale, staleFiles, cache }`).

## Notes

- The tree is kept in RAM and reloaded only when `tree.json` mtime changes.
- Traversal cache persists to `.index/traversal-cache.json` (node IDs only, no source code).
- Requires an indexed project first: `codei index .`
- Query reasoning uses the configured LLM provider; with `summaryMode: heuristic` it runs fully offline on heuristic scoring.
