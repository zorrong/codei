# pnftrading_codei-adapter-python

**Python language adapter for codei** — Parses Python source for symbols and imports.

## Supported Extensions

- `.py`

## What It Does

- Extracts top-level symbols for `codei`
- Captures imports or module references when possible
- Fits the standard `LanguageAdapter` interface used by `pnftrading_codei-core`

## Usage

```typescript
import { PythonAdapter } from "pnftrading_codei-adapter-python"

const adapter = new PythonAdapter()
```

## License

MIT — See [main repo](https://github.com/zorrong/codei)
