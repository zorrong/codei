# @codeindex/adapter-php

**PHP language adapter for codeindex** — Parses PHP namespaces, classes, methods, and properties.

## Supported Extensions

- `.php`

## What It Does

- Extracts top-level symbols for `codeindex`
- Captures imports or module references when possible
- Fits the standard `LanguageAdapter` interface used by `@codeindex/core`

## Usage

```typescript
import { PhpAdapter } from "@codeindex/adapter-php"

const adapter = new PhpAdapter()
```

## License

MIT — See [main repo](https://github.com/zorrong/codeindex)
