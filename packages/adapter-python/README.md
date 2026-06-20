# @codeindex/adapter-python

**Python language adapter for codeindex** — Parses Python source for symbols and imports.

## Supported Extensions

- `.py`

## What It Does

- Extracts top-level symbols for `codeindex`
- Captures imports or module references when possible
- Fits the standard `LanguageAdapter` interface used by `@codeindex/core`

## Usage

```typescript
import { PythonAdapter } from "@codeindex/adapter-python"

const adapter = new PythonAdapter()
```

## License

MIT — See [main repo](https://github.com/zorrong/codeindex)
