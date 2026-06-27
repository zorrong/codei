# pnftrading_codei-core

**Core engine for codei** — Tree index, retrieval logic, and interfaces.

## What is this?

The core package provides:
- **TreeBuilder** — Build hierarchical index from parsed files
- **TreeTraversal** — LLM-powered traversal to find relevant context
- **FileScanner** — File discovery with gitignore support
- **LanguageAdapter interface** — Standard interface for language parsers

## Usage

```typescript
import { IndexManager, TreeTraversal } from "pnftrading_codei-core"

const manager = new IndexManager({
  projectRoot: "/path/to/project",
  llmClient,
  adapters: [typescriptAdapter]
})

await manager.build()
const result = await traversal.traverse("How does auth work?")
```

## For Package Authors

To add support for a new language, implement the `LanguageAdapter` interface:

```typescript
interface LanguageAdapter {
  readonly language: SupportedLanguage
  readonly fileExtensions: string[]

  supports(filePath: string): boolean
  parseFile(filePath: string, projectRoot: string): Promise<ParsedFile>
  resolveImport(importPath: string, fromFile: string, projectRoot: string): Promise<string | null>
}
```

## License

MIT — See [main repo](https://github.com/zorrong/codei)
