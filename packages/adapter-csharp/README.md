# @codeindex/adapter-csharp

**C# language adapter for codeindex** — Parses C# types, methods, constructors, and properties.

## Supported Extensions

- `.cs`

## What It Does

- Extracts top-level symbols for `codeindex`
- Captures imports or module references when possible
- Fits the standard `LanguageAdapter` interface used by `@codeindex/core`

## Usage

```typescript
import { CSharpAdapter } from "@codeindex/adapter-csharp"

const adapter = new CSharpAdapter()
```

## License

MIT — See [main repo](https://github.com/zorrong/codeindex)
