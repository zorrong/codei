# @pnftrading/codei-adapter-go

**Go language adapter for codei** — Parses Go source for packages, types, and functions.

## Supported Extensions

- `.go`

## What It Does

- Extracts top-level symbols for `codei`
- Captures imports or module references when possible
- Fits the standard `LanguageAdapter` interface used by `@pnftrading/codei-core`

## Usage

```typescript
import { GoAdapter } from "@pnftrading/codei-adapter-go"

const adapter = new GoAdapter()
```

## License

MIT — See [main repo](https://github.com/zorrong/codei)
