# @pnftrading/codei-adapter-swift

**Swift language adapter for codei** — Parses Swift types, protocols, functions, and properties.

## Supported Extensions

- `.swift`

## What It Does

- Extracts top-level symbols for `codei`
- Captures imports or module references when possible
- Fits the standard `LanguageAdapter` interface used by `@pnftrading/codei-core`

## Usage

```typescript
import { SwiftAdapter } from "@pnftrading/codei-adapter-swift"

const adapter = new SwiftAdapter()
```

## License

MIT — See [main repo](https://github.com/zorrong/codei)
