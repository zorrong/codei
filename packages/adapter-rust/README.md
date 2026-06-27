# pnftrading_codei-adapter-rust

**Rust language adapter for codei** — Parses Rust items, modules, and functions.

## Supported Extensions

- `.rs`

## What It Does

- Extracts top-level symbols for `codei`
- Captures imports or module references when possible
- Fits the standard `LanguageAdapter` interface used by `pnftrading_codei-core`

## Usage

```typescript
import { RustAdapter } from "pnftrading_codei-adapter-rust"

const adapter = new RustAdapter()
```

## License

MIT — See [main repo](https://github.com/zorrong/codei)
