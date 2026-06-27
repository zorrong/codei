# pnftrading_codei-adapter-typescript

**TypeScript/JavaScript language adapter for codei** — Uses ts-morph for full AST parsing.

## Features

- Full TypeScript and JavaScript support
- JSX/TSX support
- Interface, type alias, enum extraction
- Generic type parameter support
- Doc comment extraction

## Supported Extensions

- `.ts` — TypeScript files
- `.tsx` — TypeScript JSX files
- `.js` — JavaScript files
- `.jsx` — JavaScript JSX files

## Usage

```typescript
import { TypeScriptAdapter } from "pnftrading_codei-adapter-typescript"

const adapter = new TypeScriptAdapter()

const parsed = await adapter.parseFile("src/auth/service.ts", "/project")
// Returns: { filePath, language: "typescript", symbols, imports, exports }
```

## License

MIT — See [main repo](https://github.com/zorrong/codei)
