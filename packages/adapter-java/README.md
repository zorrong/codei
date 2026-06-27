# @pnftrading/codei-adapter-java

**Java language adapter for codei** — Parses Java classes, interfaces, fields, and methods.

## Supported Extensions

- `.java`

## What It Does

- Extracts top-level symbols for `codei`
- Captures imports or module references when possible
- Fits the standard `LanguageAdapter` interface used by `@pnftrading/codei-core`

## Usage

```typescript
import { JavaAdapter } from "@pnftrading/codei-adapter-java"

const adapter = new JavaAdapter()
```

## License

MIT — See [main repo](https://github.com/zorrong/codei)
