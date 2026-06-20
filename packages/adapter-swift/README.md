# @codeindex/adapter-swift

**Swift language adapter for codeindex** — Parses Swift types, protocols, functions, and properties.

## Supported Extensions

- `.swift`

## What It Does

- Extracts top-level symbols for `codeindex`
- Captures imports or module references when possible
- Fits the standard `LanguageAdapter` interface used by `@codeindex/core`

## Usage

```typescript
import { SwiftAdapter } from "@codeindex/adapter-swift"

const adapter = new SwiftAdapter()
```

## License

MIT — See [main repo](https://github.com/zorrong/codeindex)
