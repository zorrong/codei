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
| `fresh` | boolean | `false` | Skip session dedup, resend full source |

The text ends with a footer line:

```
// tokens: ~1943 (saved 75%) | files: src/a.ts, src/b.ts
```

`saved` = context vs full dump of the selected files.

Token saving per response:

- Top-3 symbols by score render full source, the rest signature-only.
- Symbols scoring below 30% of the top score are dropped.
- Nested symbols (method inside an already-included class) are deduplicated.
- No per-file summary line — just `=== path ===` plus symbol sources.

Session dedup: within one MCP session the server remembers sent symbols.
A repeat returns a one-line reference instead of the source:

```
// AuthService — already sent (src/auth.ts:L10-L80)
```

Pass `fresh: true` to resend full source. `codei_update` clears the
session memory because line ranges may have shifted.

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
