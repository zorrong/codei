/**
 * GoAstParser — parse Go source files using regex-based extraction.
 * Extracts: packages, functions, methods, structs, interfaces, type aliases, imports.
 */

import * as fs from "fs"
import * as path from "path"
import type { RawSymbol, ParsedFile } from "@pnftrading/codei-core"

const GO_STDLIB = new Set([
  "fmt", "os", "io", "bufio", "bytes", "strings", "strconv", "errors",
  "encoding", "json", "xml", "time", "log", "flag", "context", "sync",
  "mutex", "atomic", "channel", "goroutine", "defer", "panic", "recover",
  "testing", "assert", "net", "http", "html", "template", "regexp",
  "sort", "math", "rand", "crypto", "md5", "sha1", "tls", "grpc", "sql",
  "database", "mysql", "postgres", "redis", "mongodb", "elasticsearch",
  "errors", "fmt", "io", "os", "path", "filepath", "io/ioutil", "context",
  "sync", "sync/atomic", "syncmap", "sort", "search", "index", "suffixarray",
  "unicode", "utf8", "utf16", "ascii", "hash", "hash/crc32", "hash/adler32",
  "compress", "gzip", "flate", "zlib", "archive", "tar", "zip", "mime",
  "multipart", "quote", "net", "net/http", "net/smtp", "net/rpc", "net/rpc/jsonrpc",
  "os/exec", "os/signal", "os/user", "build", "go/token", "go/parser",
  "go/scanner", "go/ast", "go/types", "go/format", "go/doc", "go/tools",
  "exp", "go", "golang", "vendor",
])

export class GoAstParser {
  constructor(private readonly projectRoot: string) {}

  async parseFile(filePath: string): Promise<ParsedFile> {
    const content = fs.readFileSync(filePath, "utf-8")
    const lines = content.split("\n")
    const symbols: RawSymbol[] = []
    const { imports, importGroups } = this.extractImports(content)

    const internalImports: string[] = []
    const externalImports: string[] = []

    for (const imp of imports) {
      if (this.isStdlib(imp)) {
        externalImports.push(imp)
      } else {
        internalImports.push(imp)
      }
    }

    const pkg = this.extractPackage(content)
    const structs = this.extractStructs(content, lines)
    const interfaces = this.extractInterfaces(content, lines)
    const typeAliases = this.extractTypeAliases(content, lines)
    const functions = this.extractFunctions(content, lines)
    const methods = this.extractMethods(content, lines)

    symbols.push(...structs, ...interfaces, ...typeAliases, ...functions, ...methods)

    const exports = symbols.filter((s) => s.isExported).map((s) => s.name)

    return {
      filePath,
      relativePath: path.relative(this.projectRoot, filePath),
      language: "go",
      symbols,
      internalImports,
      externalImports,
      exports,
    }
  }

  private extractPackage(content: string): string | undefined {
    const m = content.match(/^package\s+(\w+)/m)
    return m ? m[1] : undefined
  }

  private extractImports(content: string): { imports: string[]; importGroups: string[] } {
    const imports: string[] = []
    const importGroups: string[] = []

    for (const m of this.findAll(content, IMPORT_RE)) {
      const imp = m[1]
      if (imp) imports.push(imp)
    }

    for (const m of this.findAll(content, IMPORT_GROUP_RE)) {
      const block = m[1] ?? ""
      const names = this.extractImportNames(block)
      importGroups.push(...names)
    }

    return { imports, importGroups: importGroups.length > 0 ? importGroups : imports }
  }

  private extractImportNames(block: string): string[] {
    const names: string[] = []
    for (const m of block.matchAll(IMPORT_NAME_RE)) {
      const name = m[1] ?? m[2]
      if (name) names.push(name)
    }
    return names
  }

  private extractStructs(content: string, lines: string[]): RawSymbol[] {
    const structs: RawSymbol[] = []
    for (const m of this.findAll(content, STRUCT_RE)) {
      const name = m[1]
      if (!name) continue
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.blockEnd(startLine, lines, lines[startLine - 1] ?? "")
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      const docComment = this.extractDoc(fullSource)
      structs.push({
        name,
        kind: "class",
        signature: `type ${name} struct`,
        startLine,
        endLine,
        fullSource,
        isExported: this.isExported(name),
        docComment,
      })
    }
    return structs
  }

  private extractInterfaces(content: string, lines: string[]): RawSymbol[] {
    const interfaces: RawSymbol[] = []
    for (const m of this.findAll(content, INTERFACE_RE)) {
      const name = m[1]
      if (!name) continue
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.blockEnd(startLine, lines, lines[startLine - 1] ?? "")
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      const docComment = this.extractDoc(fullSource)
      interfaces.push({
        name,
        kind: "interface",
        signature: `type ${name} interface`,
        startLine,
        endLine,
        fullSource,
        isExported: this.isExported(name),
        docComment,
      })
    }
    return interfaces
  }

  private extractTypeAliases(content: string, lines: string[]): RawSymbol[] {
    const aliases: RawSymbol[] = []
    for (const m of this.findAll(content, TYPE_ALIAS_RE)) {
      const name = m[1]
      if (!name) continue
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.lineNum((m.index ?? 0) + m[0].length, lines)
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      const docComment = this.extractDoc(fullSource)
      aliases.push({
        name,
        kind: "type",
        signature: `type ${name} = ...`,
        startLine,
        endLine,
        fullSource,
        isExported: this.isExported(name),
        docComment,
      })
    }
    return aliases
  }

  private extractFunctions(content: string, lines: string[]): RawSymbol[] {
    const functions: RawSymbol[] = []
    for (const m of this.findAll(content, FUNC_RE)) {
      const name = m[1]
      if (!name || name === "_") continue
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.blockEnd(startLine, lines, lines[startLine - 1] ?? "")
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      const docComment = this.extractDoc(fullSource)
      const params = m[2] ?? ""
      const results = m[3] ?? ""
      const sig = results ? `func ${name}(${params}) ${results}` : `func ${name}(${params})`
      functions.push({
        name,
        kind: "function",
        signature: sig,
        startLine,
        endLine,
        fullSource,
        isExported: this.isExported(name),
        docComment,
      })
    }
    return functions
  }

  private extractMethods(content: string, lines: string[]): RawSymbol[] {
    const methods: RawSymbol[] = []
    for (const m of this.findAll(content, METHOD_RE)) {
      const receiver = m[1] ?? ""
      const name = m[2]
      if (!name || name === "_") continue
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.blockEnd(startLine, lines, lines[startLine - 1] ?? "")
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      const docComment = this.extractDoc(fullSource)
      const params = m[3] ?? ""
      const results = m[4] ?? ""
      const sig = results
        ? `func (${receiver}) ${name}(${params}) ${results}`
        : `func (${receiver}) ${name}(${params})`
      methods.push({
        name,
        kind: "method",
        signature: sig,
        startLine,
        endLine,
        fullSource,
        isExported: this.isExported(name),
        docComment,
        parentName: this.extractReceiverType(receiver),
      })
    }
    return methods
  }

  private extractReceiverType(receiver: string): string | undefined {
    const m = receiver.match(/^(\w+)|(\*?\w+)$/)
    return m ? (m[2] ?? m[1]) : undefined
  }

  private extractDoc(src: string): string | undefined {
    const lines = src.split("\n")
    const docLines: string[] = []
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith("//")) {
        docLines.push(trimmed.replace(/^\/\/\s*/, ""))
      } else if (docLines.length > 0 || trimmed === "") {
        break
      } else {
        break
      }
    }
    return docLines.length > 0 ? docLines.join(" ").trim() : undefined
  }

  private blockEnd(startLine: number, lines: string[], firstLine: string): number {
    const baseIndent = this.indent(firstLine)
    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i]
      if (!line) continue
      const trimmed = line.trim()
      if (trimmed === "") continue
      if (trimmed.startsWith("//")) continue
      if (this.indent(line) <= baseIndent && i > startLine) {
        return i
      }
    }
    return lines.length
  }

  private indent(line: string): number {
    return (line.match(/^(\s*)/)?.[1] ?? "").length
  }

  private lineNum(charIdx: number, lines: string[]): number {
    let count = 0
    for (let i = 0; i < lines.length; i++) {
      count += (lines[i]?.length ?? 0) + 1
      if (count > charIdx) return i + 1
    }
    return lines.length
  }

  private isExported(name: string): boolean {
    if (!name) return false
    const first = name.charAt(0)
    return first === first.toUpperCase()
  }

  private isStdlib(modulePath: string): boolean {
    const top = modulePath.split("/")[0] ?? ""
    if (!top) return false
    const withoutVersion = top.replace(/^v\d+(\.\d+)*$/, "")
    return GO_STDLIB.has(withoutVersion) || top.startsWith("golang.org") || top.startsWith("github.com")
  }

  private findAll(content: string, re: RegExp): RegExpMatchArray[] {
    const results: RegExpMatchArray[] = []
    let match: RegExpExecArray | null
    const r = new RegExp(re.source, "gm")
    while ((match = r.exec(content)) !== null) {
      results.push(match)
      if (match.index === r.lastIndex) r.lastIndex++
    }
    return results
  }
}

const IMPORT_RE = /import\s+"([^"]+)"/g
const IMPORT_GROUP_RE = /import\s+\(([\s\S]*?)\)/g
const IMPORT_NAME_RE = /^\s*"([^"]+)"\s*(?:\/\/\s*(\S+))?/gm
const STRUCT_RE = /^type\s+(\w+)\s+struct\s*\{/gm
const INTERFACE_RE = /^type\s+(\w+)\s+interface\s*\{/gm
const TYPE_ALIAS_RE = /^type\s+(\w+)\s*=\s*/gm
const FUNC_RE = /^func\s+(\w+)\s*\(([^)]*)\)\s*(.*?)?\{/gm
const METHOD_RE = /^func\s+\(([^)]+)\)\s+(\w+)\s*\(([^)]*)\)\s*(.*?)?\{/gm
