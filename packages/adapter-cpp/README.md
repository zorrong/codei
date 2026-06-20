# @codeindex/adapter-cpp

**C/C++ language adapter for codeindex** — Parses C/C++ classes, structs, and functions.

## Supported Extensions

- `.cpp`
- `.cc`
- `.hpp`
- `.h`

## What It Does

- Extracts top-level symbols for `codeindex`
- Captures imports or module references when possible
- Fits the standard `LanguageAdapter` interface used by `@codeindex/core`

## Usage

```typescript
import { CppAdapter } from "@codeindex/adapter-cpp"

const adapter = new CppAdapter()
```

## License

MIT — See [main repo](https://github.com/zorrong/codeindex)
