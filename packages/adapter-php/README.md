# @pnftrading/codei-adapter-php

**PHP language adapter for codei** — Parses PHP namespaces, classes, methods, and properties.

## Supported Extensions

- `.php`

## What It Does

- Extracts top-level symbols for `codei`
- Captures imports or module references when possible
- Fits the standard `LanguageAdapter` interface used by `@pnftrading/codei-core`

## Usage

```typescript
import { PhpAdapter } from "@pnftrading/codei-adapter-php"

const adapter = new PhpAdapter()
```

## License

MIT — See [main repo](https://github.com/zorrong/codei)
