# Language Adapters

## Overview

Each language adapter implements the `LanguageAdapter` interface and provides:
- **AST Parsing** — Extract symbols (classes, functions, interfaces, etc.)
- **Dependency Resolution** — Resolve imports to file paths
- **Documentation Extraction** — Extract doc comments

## LanguageAdapter Interface

```typescript
interface LanguageAdapter {
  readonly language: SupportedLanguage
  readonly fileExtensions: string[]

  supports(filePath: string): boolean
  parseFile(filePath: string, projectRoot: string): Promise<ParsedFile>
  resolveImport(importPath: string, fromFile: string, projectRoot: string): Promise<string | null>
}
```

## Supported Adapters

| Adapter | Language | File Extensions | Parser |
|---------|----------|-----------------|--------|
| `pnftrading_codei-adapter-typescript` | TypeScript | `.ts`, `.tsx` | ts-morph |
| `pnftrading_codei-adapter-python` | Python | `.py` | Regex |
| `pnftrading_codei-adapter-go` | Go | `.go` | Regex |
| `pnftrading_codei-adapter-rust` | Rust | `.rs` | Regex |
| `pnftrading_codei-adapter-java` | Java | `.java` | Regex |
| `pnftrading_codei-adapter-csharp` | C# | `.cs` | Regex |
| `pnftrading_codei-adapter-cpp` | C/C++ | `.cpp`, `.cc`, `.hpp`, `.h` | Regex |
| `pnftrading_codei-adapter-php` | PHP | `.php` | Regex |
| `pnftrading_codei-adapter-swift` | Swift | `.swift` | Regex |

---

## TypeScript Adapter

**Package**: `pnftrading_codei-adapter-typescript`
**Parser**: ts-morph (full AST)

### Features
- Full TypeScript AST parsing
- Interface, type alias, enum extraction
- Generic type parameter support
- JSX/TSX support

### Symbol Kinds
- `class`, `interface`, `enum`, `type`, `function`, `method`

---

## Python Adapter

**Package**: `pnftrading_codei-adapter-python`
**Parser**: Regex-based

### Features
- Class, function extraction
- Import/from-import resolution
- Docstring extraction (Google, NumPy, Epydoc styles)
- Decorator detection

### Symbol Kinds
- `class`, `function`, `method`

### Imports Detected
```python
import os
from pathlib import Path
from collections import defaultdict as dd
```

---

## Go Adapter

**Package**: `pnftrading_codei-adapter-go`
**Parser**: Regex-based

### Features
- Package-level symbols
- Import resolution
- Struct, interface, function extraction
- GOPATH/module resolution

### Symbol Kinds
- `struct`, `interface`, `function`, `method`

### Imports Detected
```go
import (
    "fmt"
    "net/http"
    mypkg "github.com/user/pkg"
)
```

---

## Rust Adapter

**Package**: `pnftrading_codei-adapter-rust`
**Parser**: Regex-based

### Features
- Crate/module hierarchy
- Struct, enum, trait extraction
- Use statement resolution
- Doc comment extraction

### Symbol Kinds
- `struct`, `enum`, `trait`, `function`, `method`

### Imports Detected
```rust
use std::collections::HashMap;
use crate::module::Item;
```

---

## Java Adapter

**Package**: `pnftrading_codei-adapter-java`
**Parser**: Regex-based

### Features
- Class, interface, enum extraction
- Package resolution
- Javadoc extraction
- Method visibility detection

### Symbol Kinds
- `class`, `interface`, `enum`, `method`, `annotation`

### Imports Detected
```java
import java.util.List;
import com.example.MyClass;
```

---

## C# Adapter

**Package**: `pnftrading_codei-adapter-csharp`
**Parser**: Regex-based

### Features
- Class, struct, interface, enum extraction
- Namespace resolution
- XML doc comment extraction
- Access modifier detection

### Symbol Kinds
- `class`, `struct`, `interface`, `enum`, `delegate`, `method`

### Imports Detected
```csharp
using System;
using System.Collections.Generic;
using MyNamespace.MyClass;
```

---

## C++ Adapter

**Package**: `pnftrading_codei-adapter-cpp`
**Parser**: Regex-based

### Features
- Class, struct, enum, union extraction
- Header include resolution
- Namespace support
- Template detection

### Symbol Kinds
- `class`, `struct`, `enum`, `union`, `function`, `method`

### Imports Detected
```cpp
#include <iostream>
#include "myheader.hpp"
```

---

## PHP Adapter

**Package**: `pnftrading_codei-adapter-php`
**Parser**: Regex-based

### Features
- Class, interface, trait extraction
- PHP namespace resolution
- DocBlock extraction
- PSR-4 autoload support

### Symbol Kinds
- `class`, `interface`, `trait`, `function`, `method`

### Imports Detected
```php
use Illuminate\Database\Eloquent\Model;
use App\Models\User;
```

---

## Swift Adapter

**Package**: `pnftrading_codei-adapter-swift`
**Parser**: Regex-based

### Features
- Class, struct, enum, protocol extraction
- Extension handling
- Swift import resolution
- Swift doc comment extraction

### Symbol Kinds
- `class`, `struct`, `enum`, `protocol`, `extension`, `function`, `method`

### Imports Detected
```swift
import Foundation
import UIKit
import MyLocalModule
```

---

## Creating a New Adapter

### 1. Create Package

```bash
mkdir -p packages/adapter-newlang/src
```

### 2. Package.json

```json
{
  "name": "pnftrading_codei-adapter-newlang",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc"
  },
  "dependencies": {
    "pnftrading_codei-core": "workspace:*"
  }
}
```

### 3. Implement Adapter

```typescript
// src/NewlangAdapter.ts
import type { LanguageAdapter, ParsedFile } from "pnftrading_codei-core"

export class NewlangAdapter implements LanguageAdapter {
  readonly language = "newlang" as const
  readonly fileExtensions = [".nl"]

  async parseFile(filePath: string, projectRoot: string): Promise<ParsedFile> {
    // Parse file and extract symbols
  }

  async resolveImport(importPath: string, fromFile: string, projectRoot: string): Promise<string | null> {
    // Resolve import to file path
  }

  supports(filePath: string): boolean {
    return filePath.endsWith(".nl")
  }
}
```

### 4. Export

```typescript
// src/index.ts
export { NewlangAdapter } from "./NewlangAdapter.js"
```

### 5. Add to Core

Update `packages/core/src/types/RawSymbol.ts`:

```typescript
export type SupportedLanguage = "typescript" | "python" | "go" | "rust" | "java" | "csharp" | "cpp" | "php" | "swift" | "newlang"
```

---

## Symbol Extraction Patterns

### Class/Type Declaration

```typescript
// Python
/\bclass\s+(\w+)/

// Go
/\btype\s+(\w+)\s+struct|interface/

// Rust
/\bstruct\s+(\w+)|\benum\s+(\w+)|\btrait\s+(\w+)/
```

### Function/Method

```typescript
// Python
/\bdef\s+(\w+)\s*\(/g

// Go
/\bfunc\s+(\w+)\s*\(/g

// Rust
/\bfn\s+(\w+)\s*\(/g
```

### Imports

```typescript
// Python
/(?:from\s+([\w.]+)\s+)?import\s+([\w*\s,]+)/g

// Go
/"([^"]+)"|`([^`]+)`/g

// JavaScript/TypeScript
/import\s+(?:{[^}]+}|[^;]+)\s+from\s+['"]([^'"]+)['"]/g
```
