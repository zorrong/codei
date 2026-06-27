# AI Agents Guide for codei

This project uses `codei` for efficient, reasoning-based codebase exploration. **Always use `codei` first** before reading files manually or making assumptions about the codebase.

## 🚨 Critical Rule: ALWAYS Use codei First

**Before answering any question about the codebase, you MUST query the index first.**

```bash
# Quick query
codei query "your question"

# Or use HTTP API (faster if server running)
curl -s -X POST http://localhost:3131/query \
  -H "Content-Type: application/json" \
  -d '{"query": "YOUR_QUESTION", "maxTokens": 4000}' \
  | jq -r '.context'
```

## Universal Agent Compatibility

This guide is designed to work with **ANY AI agent** that supports external tool execution:

### Claude Code
```bash
# Add to ~/.claude/tools/codei.sh
curl -s -X POST http://localhost:3131/query \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"$1\", \"maxTokens\": 3000}" | jq -r '.context'
```

### Cursor / Windsurf
Create `.cursorrules` or `.windsurfrules`:
```markdown
# Codei Context Retrieval
When you need to understand the codebase or follow dependency chains:
1. Run: curl -s -X POST http://localhost:3131/query -d '{"query": "YOUR_QUERY"}' | jq -r '.context'
2. Use the output to base your reasoning and implementation.
```

### Cline (VSCode)
In Plan Mode or custom instructions:
```
Use codei query "<your question>" to get relevant code context.
Start server with: codei serve . --port 3131
```

### Trae Agent
Load the `codei` skill from `.trae/skills/codei/SKILL.md` for full integration.

## ❌ DON'T vs ✅ DO

| DON'T | DO |
|-------|-----|
| Read files manually to understand code | Use `codei query` |
| Make assumptions about function signatures | Query to get accurate context |
| Use grep/find for code patterns | Use HTTP API or CLI query |
| Dump entire files into prompts | Let codei extract only relevant symbols |

## Workflow for Every Task

1. **Query first:** `codei query "<your question>"`
2. **Get context:** Review the returned code fragments and dependency info
3. **If needed:** Only then read specific files for more details
4. **Update index:** After making changes, run `codei update`

## Maintaining the Index

```bash
# Update after file changes
codei update

# Or via HTTP
curl -s -X POST http://localhost:3131/update

# Check status
codei status
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| No index found | Run `codei index .` |
| Outdated context | Run `codei update` |
| API Key issues | Check `codei setup` |
| Server not running | Run `codei serve . --port 3131` |

## For Complete Reference

See **CODERULES.md** for:
- Full list of query patterns
- Detailed command options
- Troubleshooting guide
