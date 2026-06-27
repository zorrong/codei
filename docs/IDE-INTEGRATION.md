# Integrating codei With IDEs and AI Coding Agents

This guide is for any project where you code with Codex, Claude Code, Cursor, Windsurf, Cline, Antigravity, or similar AI-powered IDEs and agents.

The simplest goal: make the agent ask `codei` for relevant repository context before it answers codebase questions or edits files.

## 1. Install codei Once

```bash
npm install -g pnftrading_codei
codei setup
```

`codei setup` asks for your provider, API key, model, and optional base URL. Runtime config is stored in `~/.codei/config.json` and `~/.codei/.env`.

The npm package installs both command aliases:

```bash
codei --help
codeindex --help
```

## 2. Initialize Each Project

From the project root:

```bash
codei init --agent all
codei index .
```

Run a quick smoke test:

```bash
codei query "What does this project do? Where are the main modules?"
```

If the answer looks useful, your IDE or agent can use `codei` for context.

## 3. Simplest Setup for Any IDE: Generate Agent Rules

`codei init --agent all` creates these files when they do not already exist:

- `AGENTS.md` for Codex and generic terminal agents
- `CLAUDE.md` for Claude Code
- `.cursorrules` for Cursor
- `.windsurfrules` for Windsurf
- `.antigravity/rules.md` for Antigravity-style IDEs

Use `--agent codex`, `--agent claude`, `--agent cursor`, `--agent windsurf`, or `--agent antigravity` to generate only one target. You can also pass comma-separated targets, for example `--agent codex,claude`.

If you want to write the rule manually, create `AGENTS.md` in the project root:

````markdown
# Agent instructions

This project uses `codei` for precise repository context.

Before answering codebase questions, editing code, refactoring, debugging, or explaining logic flow:

1. Run `codei query "<specific question>"` to retrieve relevant context.
2. After editing files, run `codei update` to refresh the index.
3. Do not read or dump the whole codebase if `codei query` returns enough context.

Useful commands:

```bash
codei query "how does the login flow work?"
codei query "which files handle payments?" --max-tokens 3000
codei query "explain the auth module" --format json
codei update
```
````

The generated `AGENTS.md` works well for Codex and any agent that reads project-level instruction files. If your IDE does not read `AGENTS.md`, copy the same content into its custom instructions or project rules.

## 4. Direct Prompt Pattern

When asking an agent for help, add a clear instruction:

```text
Before answering, run:
codei query "<my question>"
Use the codei output as the primary context.
```

Example:

```text
Before fixing the login bug, run:
codei query "where is the login flow and token validation implemented?"
Then fix the bug and run the relevant tests.
```

## 5. Integration Through the Local HTTP Server

If your IDE or agent can call HTTP endpoints, run the server in a separate terminal:

```bash
codei serve . --port 3131
```

Query with curl:

```bash
curl -s -X POST http://localhost:3131/query \
  -H "Content-Type: application/json" \
  -d '{"query":"explain the auth flow","maxTokens":3000}' \
  | jq -r '.context'
```

Update the index:

```bash
curl -s -X POST http://localhost:3131/update
```

Check server health:

```bash
curl -s http://localhost:3131/health
```

## 6. IDE and Agent-Specific Setup

### Codex

Use `AGENTS.md` as the simplest integration. Put the file in the project root and instruct Codex to run `codei query` before working with the codebase.

Short snippet:

```markdown
Always run `codei query "<task-specific question>"` before answering codebase questions or editing code. After edits, run `codei update`.
```

### Claude Code

Create a helper script:

```bash
mkdir -p ~/.claude/tools
cat > ~/.claude/tools/codei.sh <<'SCRIPT'
#!/usr/bin/env bash
QUERY="$1"
curl -s -X POST http://localhost:3131/query \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"$QUERY\",\"maxTokens\":3000}" \
  | jq -r '.context'
SCRIPT
chmod +x ~/.claude/tools/codei.sh
```

Run the server in the project:

```bash
codei serve . --port 3131
```

Then tell Claude Code:

```text
When you need code context, use ~/.claude/tools/codei.sh "<question>" before editing code.
```

### Cursor / Windsurf

Add this to `.cursorrules` or `.windsurfrules`:

```markdown
When you need codebase context, run:

codei query "YOUR_QUESTION"

For larger context, use:

curl -s -X POST http://localhost:3131/query \
  -H "Content-Type: application/json" \
  -d '{"query":"YOUR_QUESTION","maxTokens":3000}' | jq -r '.context'

After code edits, run `codei update`.
```

### Cline in VS Code

Add this to Custom Instructions or Plan Mode instructions:

```text
Before analyzing or editing this repository, run `codei query "<specific question>"` and use that output as the primary context. After edits, run `codei update`.
```

### Antigravity / Gemini-Style AI IDEs

If the IDE supports project rules or custom instructions, add:

```text
Use codei for repository context.
Run `codei query "<specific question>"` before answering codebase questions, debugging, or editing files.
If a terminal is not available, ask me to run the command and paste the output.
After edits, run `codei update`.
```

If the IDE supports shell tools, allow these commands:

```bash
codei query "..."
codei status .
codei update .
```

## 7. Daily Workflow

First time in a project:

```bash
codei init --agent all
codei index .
```

At the start of a task:

```bash
codei query "which files or modules are relevant to this task?"
```

After editing code:

```bash
codei update
```

If the index looks wrong:

```bash
codei status .
codei index .
```

## 8. Troubleshooting

| Problem | Fix |
| --- | --- |
| `No index found` | Run `codei index .` from the project root |
| Query returns too little context | Ask a more specific question, increase `--max-tokens`, or rebuild with `codei index .` |
| IDE cannot run shell commands | Run `codei query` in a terminal and paste the output into the IDE |
| HTTP server does not connect | Run `codei serve . --port 3131` and check `curl http://localhost:3131/health` |
| Context is stale after edits | Run `codei update` |
