# @pnftrading/codei-adapter-cpp

**C/C++ language adapter for codei** — Parses C/C++ classes, structs, and functions.

## Supported Extensions

- `.cpp`
- `.cc`
- `.hpp`
- `.h`

## What It Does

- Extracts top-level symbols for `codei`
- Captures imports or module references when possible
- Fits the standard `LanguageAdapter` interface used by `@pnftrading/codei-core`

## Usage

```typescript
import { CppAdapter } from "@pnftrading/codei-adapter-cpp"

const adapter = new CppAdapter()
```

## License

MIT — See [main repo](https://github.com/zorrong/codei)
