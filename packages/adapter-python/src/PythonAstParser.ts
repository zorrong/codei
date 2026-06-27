/**
 * PythonAstParser — parse Python source files using regex-based extraction.
 */

import * as fs from "fs"
import * as path from "path"
import type { RawSymbol, ParsedFile } from "@pnftrading/codei-core"

const PYTHON_STDLIB = new Set([
  "sys", "os", "re", "json", "math", "time", "datetime", "collections",
  "itertools", "functools", "typing", "abc", "asyncio", "unittest",
  "io", "pathlib", "tempfile", "shutil", "glob", "copy", "pprint",
  "hashlib", "random", "platform", "struct", "codecs", "csv", "logging",
  "warnings", "enum", "dataclasses", "contextlib",
])

const RESERVED = new Set([
  "and", "as", "assert", "async", "await", "break", "class", "continue",
  "def", "del", "elif", "else", "except", "finally", "for", "from",
  "global", "if", "import", "in", "is", "lambda", "nonlocal", "not",
  "or", "pass", "raise", "return", "try", "while", "with", "yield",
  "True", "False", "None",
])

export class PythonAstParser {
  constructor(private readonly projectRoot: string) {}

  async parseFile(filePath: string): Promise<ParsedFile> {
    const content = fs.readFileSync(filePath, "utf-8")
    const lines = content.split("\n")
    const symbols = this.extractSymbols(content, lines)
    const { imports, fromImports } = this.extractImports(content)

    const internalImports: string[] = []
    const externalImports: string[] = [...imports]

    for (const fi of fromImports) {
      const topLevel = fi.module.split(".")[0] ?? ""
      if (PYTHON_STDLIB.has(topLevel) || topLevel.startsWith("_")) {
        externalImports.push(fi.module)
      } else {
        internalImports.push(fi.module)
      }
    }

    const exports = symbols.filter((s) => s.isExported).map((s) => s.name)

    return {
      filePath,
      relativePath: path.relative(this.projectRoot, filePath),
      language: "python",
      symbols,
      internalImports,
      externalImports,
      exports,
    }
  }

  private extractSymbols(content: string, lines: string[]): RawSymbol[] {
    const symbols: RawSymbol[] = []
    for (const m of this.findAll(content, CLASS_RE)) {
      const s = this.parseClass(m, lines)
      if (s) symbols.push(s)
    }
    for (const m of this.findAll(content, FN_RE)) {
      const s = this.parseFn(m, lines, false)
      if (s) symbols.push(s)
    }
    for (const m of this.findAll(content, ASYNC_FN_RE)) {
      const s = this.parseFn(m, lines, true)
      if (s) symbols.push(s)
    }
    return symbols
  }

  private parseClass(m: RegExpMatchArray, lines: string[]): RawSymbol | null {
    const name = m[1]
    if (!name || RESERVED.has(name)) return null
    const startLine = this.lineNum(m.index ?? 0, lines)
    const endLine = this.blockEnd(startLine, lines)
    const base = m[2] ?? ""
    const fullSource = lines.slice(startLine - 1, endLine).join("\n")
    const docComment = this.extractDoc(fullSource)
    return {
      name,
      kind: "class",
      signature: base ? "class " + name + "(" + base + ")" : "class " + name,
      startLine,
      endLine,
      fullSource,
      isExported: false,
      docComment,
    }
  }

  private parseFn(m: RegExpMatchArray, lines: string[], isAsync: boolean, parentName?: string, offsetLine = 0): RawSymbol | null {
    const name = m[1]
    if (!name || RESERVED.has(name)) return null
    const idx = m.index ?? 0
    const startLine = offsetLine > 0 ? offsetLine + this.lineNum(idx, lines) - 1 : this.lineNum(idx, lines)
    const endLine = this.blockEnd(startLine, lines)
    const params = m[2] ?? ""
    const fullSource = lines.slice(startLine - 1, endLine).join("\n")
    const docComment = this.extractDoc(fullSource)
    const prefix = isAsync ? "async def " : "def "
    return {
      name,
      kind: parentName ? "method" : "function",
      signature: prefix + name + "(" + params + ")",
      startLine,
      endLine,
      fullSource,
      isExported: false,
      docComment,
      parentName,
    }
  }

  private extractImports(content: string): { imports: string[]; fromImports: Array<{ module: string; names: string[] }> } {
    const imports: string[] = []
    const fromImports: Array<{ module: string; names: string[] }> = []
    for (const m of this.findAll(content, IMPORT_RE)) {
      const imp = m[1]
      if (imp) imports.push(imp)
    }
    for (const m of this.findAll(content, FROM_IMPORT_RE)) {
      const module = m[1]
      const namesStr = m[2] ?? ""
      const names = namesStr.split(",").map(function(n) { return n.trim() }).filter(Boolean)
      if (module) fromImports.push({ module: module, names: names })
    }
    return { imports: imports, fromImports: fromImports }
  }

  private extractModuleDocComment(content: string): string | undefined {
    const firstLine = (content.split("\n")[0] ?? "").trim()
    if (firstLine.startsWith('"""') || firstLine.startsWith("'''")) {
      const q = firstLine.slice(0, 3)
      const end = content.indexOf(q, 3)
      if (end !== -1) return content.slice(3, end).trim()
    }
    return undefined
  }

  private extractDoc(src: string): string | undefined {
    const lines = src.split("\n")
    let inDoc = false
    const docLines: string[] = []
    for (const line of lines) {
      const trimmed = line.trim()
      if (!inDoc) {
        if (trimmed.startsWith('"""') || trimmed.startsWith("'''")) {
          inDoc = true
          const rest = trimmed.slice(3)
          const q = trimmed.includes('"""') ? '"""' : "'''"
          if (rest && q && rest.includes(q)) {
            const parts = rest.split(q)
            return parts[0] ? parts[0].trim() : undefined
          }
          docLines.push(rest)
        }
      } else {
        const q = trimmed.includes('"""') ? '"""' : trimmed.includes("'''") ? "'''" : null
        if (q) {
          docLines.pop()
          return docLines.join(" ").trim()
        }
        docLines.push(trimmed)
      }
    }
    return docLines.length > 0 ? docLines.join(" ").trim() : undefined
  }

  private blockEnd(startLine: number, lines: string[]): number {
    const baseIndent = this.indent(lines[startLine - 1] ?? "")
    let inStr = false
    let strChar = ""
    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i]
      if (!line) continue
      const trimmed = line.trim()
      if (trimmed === "" || trimmed.startsWith("#")) continue
      if (this.indent(line) <= baseIndent && !inStr) return i
      for (let j = 0; j < line.length; j++) {
        const c = line[j]
        if (!inStr && (c === '"' || c === "'")) {
          if (j + 2 < line.length && line[j + 2] === c && line[j + 1] === c) {
            inStr = true; strChar = c; j += 2
          } else {
            inStr = true; strChar = c
          }
        } else if (inStr && c === strChar && line[j - 1] !== "\\") {
          inStr = false
        }
      }
    }
    return lines.length
  }

  private indent(line: string): number {
    const m = line.match(/^(\s*)/)
    return m ? String(m[1]).length : 0
  }

  private lineNum(charIdx: number, lines: string[]): number {
    let count = 0
    for (let i = 0; i < lines.length; i++) {
      count += (lines[i]?.length ?? 0) + 1
      if (count > charIdx) return i + 1
    }
    return lines.length
  }

  private findAll(content: string, re: RegExp): RegExpMatchArray[] {
    const results: RegExpMatchArray[] = []
    let match: RegExpExecArray | null
    const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`
    const r = new RegExp(re.source, flags)
    while ((match = r.exec(content)) !== null) {
      results.push(match)
      if (match.index === r.lastIndex) r.lastIndex++
    }
    return results
  }
}

const CLASS_RE = /^class\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\([^)]*\))?\s*:/gm
const FN_RE = /^def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*:/gm
const ASYNC_FN_RE = /^async\s+def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*:/gm
const METHOD_RE = /^    def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*:/gm
const ASYNC_METHOD_RE = /^    async\s+def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*:/gm
const IMPORT_RE = /^import\s+([A-Za-z_][A-Za-z0-9_.]*)/gm
const FROM_IMPORT_RE = /^from\s+([A-Za-z_][A-Za-z0-9_.]*)\s+import\s+(.+)/gm
