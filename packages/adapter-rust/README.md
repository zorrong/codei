# @codeindex/adapter-rust

**Rust language adapter for codeindex** — Parses Rust items, modules, and functions.

## Supported Extensions

- `.rs`

## What It Does

- Extracts top-level symbols for `codeindex`
- Captures imports or module references when possible
- Fits the standard `LanguageAdapter` interface used by `@codeindex/core`

## Usage

```typescript
import { RustAdapter } from "@codeindex/adapter-rust"

const adapter = new RustAdapter()
```

## License

MIT — See [main repo](https://github.com/zorrong/codeindex)
