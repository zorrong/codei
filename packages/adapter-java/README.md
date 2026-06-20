# @codeindex/adapter-java

**Java language adapter for codeindex** — Parses Java classes, interfaces, fields, and methods.

## Supported Extensions

- `.java`

## What It Does

- Extracts top-level symbols for `codeindex`
- Captures imports or module references when possible
- Fits the standard `LanguageAdapter` interface used by `@codeindex/core`

## Usage

```typescript
import { JavaAdapter } from "@codeindex/adapter-java"

const adapter = new JavaAdapter()
```

## License

MIT — See [main repo](https://github.com/zorrong/codeindex)
