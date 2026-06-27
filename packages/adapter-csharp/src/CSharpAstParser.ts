/**
 * CSharpAstParser — parse C# source files using regex-based extraction.
 * Extracts: classes, structs, interfaces, enums, delegates, records, methods, properties, constructors, namespaces, using statements.
 */

import * as fs from "fs"
import * as path from "path"
import type { RawSymbol, ParsedFile } from "pnftrading_codei-core"

const CSHARP_KEYWORDS = new Set([
  "abstract", "as", "base", "bool", "break", "byte", "case", "catch", "char", "checked",
  "class", "const", "continue", "decimal", "default", "delegate", "do", "double", "else",
  "enum", "event", "explicit", "extern", "false", "finally", "fixed", "float", "for",
  "foreach", "goto", "if", "implicit", "in", "int", "interface", "internal", "is", "lock",
  "long", "namespace", "new", "null", "object", "operator", "out", "override", "params",
  "private", "protected", "public", "readonly", "ref", "return", "sbyte", "sealed", "short",
  "sizeof", "stackalloc", "static", "string", "struct", "switch", "this", "throw", "true",
  "try", "typeof", "uint", "ulong", "unchecked", "unsafe", "ushort", "using", "virtual",
  "void", "volatile", "while", "async", "await", "var", "dynamic", "nameof", "when",
  "where", "yield", "record", "init", "required", "file", " scoped",
])

export class CSharpAstParser {
  constructor(private readonly projectRoot: string) {}

  async parseFile(filePath: string): Promise<ParsedFile> {
    const content = fs.readFileSync(filePath, "utf-8")
    const lines = content.split("\n")
    const symbols: RawSymbol[] = []

    const classes = this.extractClasses(content, lines)
    const structs = this.extractStructs(content, lines)
    const interfaces = this.extractInterfaces(content, lines)
    const enums = this.extractEnums(content, lines)
    const delegates = this.extractDelegates(content, lines)
    const records = this.extractRecords(content, lines)
    const methods = this.extractMethods(content, lines)
    const props = this.extractProperties(content, lines)
    const ctors = this.extractConstructors(content, lines)

    symbols.push(...classes, ...structs, ...interfaces, ...enums, ...delegates, ...records, ...methods, ...props, ...ctors)

    const { usingStatements, namespaced } = this.extractNamespacesAndUsings(content)

    const internalImports: string[] = []
    const externalImports: string[] = []

    for (const u of usingStatements) {
      if (this.isSystemOrExternal(u)) {
        externalImports.push(u)
      } else {
        internalImports.push(u)
      }
    }

    const exports = symbols.filter((s) => s.isExported).map((s) => s.name)

    return {
      filePath,
      relativePath: path.relative(this.projectRoot, filePath),
      language: "csharp",
      symbols,
      internalImports,
      externalImports,
      exports,
    }
  }

  private extractClasses(content: string, lines: string[]): RawSymbol[] {
    const classes: RawSymbol[] = []
    for (const m of this.findAll(content, CLASS_RE)) {
      const name = m[2]
      if (!name) continue
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.braceEnd(startLine, lines)
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      const docComment = this.extractDoc(fullSource)
      const isExported = Boolean(m[0].match(/\bpublic\b/))
      classes.push({
        name,
        kind: "class",
        signature: `class ${name}`,
        startLine,
        endLine,
        fullSource,
        isExported,
        docComment,
      })
    }
    return classes
  }

  private extractStructs(content: string, lines: string[]): RawSymbol[] {
    const structs: RawSymbol[] = []
    for (const m of this.findAll(content, STRUCT_RE)) {
      const name = m[2]
      if (!name) continue
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.braceEnd(startLine, lines)
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      const docComment = this.extractDoc(fullSource)
      const isExported = Boolean(m[0].match(/\bpublic\b/))
      structs.push({
        name,
        kind: "struct",
        signature: `struct ${name}`,
        startLine,
        endLine,
        fullSource,
        isExported,
        docComment,
      })
    }
    return structs
  }

  private extractInterfaces(content: string, lines: string[]): RawSymbol[] {
    const interfaces: RawSymbol[] = []
    for (const m of this.findAll(content, INTERFACE_RE)) {
      const name = m[2]
      if (!name) continue
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.braceEnd(startLine, lines)
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      const docComment = this.extractDoc(fullSource)
      const isExported = Boolean(m[0].match(/\bpublic\b/))
      interfaces.push({
        name,
        kind: "interface",
        signature: `interface ${name}`,
        startLine,
        endLine,
        fullSource,
        isExported,
        docComment,
      })
    }
    return interfaces
  }

  private extractEnums(content: string, lines: string[]): RawSymbol[] {
    const enums: RawSymbol[] = []
    for (const m of this.findAll(content, ENUM_RE)) {
      const name = m[2]
      if (!name) continue
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.braceEnd(startLine, lines)
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      const docComment = this.extractDoc(fullSource)
      const isExported = Boolean(m[0].match(/\bpublic\b/))
      enums.push({
        name,
        kind: "enum",
        signature: `enum ${name}`,
        startLine,
        endLine,
        fullSource,
        isExported,
        docComment,
      })
    }
    return enums
  }

  private extractDelegates(content: string, lines: string[]): RawSymbol[] {
    const delegates: RawSymbol[] = []
    for (const m of this.findAll(content, DELEGATE_RE)) {
      const name = m[2]
      if (!name) continue
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.lineNum((m.index ?? 0) + m[0].length, lines)
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      const docComment = this.extractDoc(fullSource)
      const isExported = Boolean(m[0].match(/\bpublic\b/))
      delegates.push({
        name,
        kind: "function",
        signature: `delegate ${name}(...)`,
        startLine,
        endLine,
        fullSource,
        isExported,
        docComment,
      })
    }
    return delegates
  }

  private extractRecords(content: string, lines: string[]): RawSymbol[] {
    const records: RawSymbol[] = []
    for (const m of this.findAll(content, RECORD_RE)) {
      const name = m[2]
      if (!name) continue
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.braceEnd(startLine, lines)
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      const docComment = this.extractDoc(fullSource)
      const isExported = Boolean(m[0].match(/\bpublic\b/))
      records.push({
        name,
        kind: "class",
        signature: `record ${name}`,
        startLine,
        endLine,
        fullSource,
        isExported,
        docComment,
      })
    }
    return records
  }

  private extractMethods(content: string, lines: string[]): RawSymbol[] {
    const methods: RawSymbol[] = []
    for (const m of this.findAll(content, METHOD_RE)) {
      const name = m[2]
      if (!name || CSHARP_KEYWORDS.has(name)) continue
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.braceEnd(startLine, lines)
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      const docComment = this.extractDoc(fullSource)
      const isExported = Boolean(m[0].match(/\bpublic\b/))
      const params = m[3] ?? ""
      methods.push({
        name,
        kind: "method",
        signature: `${name}(${params})`,
        startLine,
        endLine,
        fullSource,
        isExported,
        docComment,
      })
    }
    return methods
  }

  private extractProperties(content: string, lines: string[]): RawSymbol[] {
    const props: RawSymbol[] = []
    for (const m of this.findAll(content, PROPERTY_RE)) {
      const name = m[3]
      if (!name) continue
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.braceEnd(startLine, lines)
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      const docComment = this.extractDoc(fullSource)
      const isExported = Boolean(m[0].match(/\bpublic\b/))
      const propType = m[2] ?? "var"
      props.push({
        name,
        kind: "property",
        signature: `${propType} ${name} { ... }`,
        startLine,
        endLine,
        fullSource,
        isExported,
        docComment,
      })
    }
    return props
  }

  private extractConstructors(content: string, lines: string[]): RawSymbol[] {
    const ctors: RawSymbol[] = []
    for (const m of this.findAll(content, CTOR_RE)) {
      const name = m[2]
      if (!name) continue
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.braceEnd(startLine, lines)
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      const docComment = this.extractDoc(fullSource)
      const isExported = Boolean(m[0].match(/\bpublic\b/))
      ctors.push({
        name,
        kind: "method",
        signature: `${name}(...)`,
        startLine,
        endLine,
        fullSource,
        isExported,
        docComment,
      })
    }
    return ctors
  }

  private extractNamespacesAndUsings(content: string): { usingStatements: string[]; namespaced: string[] } {
    const usingStatements: string[] = []
    const namespaced: string[] = []

    for (const m of this.findAll(content, USING_RE)) {
      const ns = m[1]
      if (ns) usingStatements.push(ns)
    }

    for (const m of this.findAll(content, NAMESPACE_RE)) {
      const ns = m[1]
      if (ns) namespaced.push(ns)
    }

    return { usingStatements, namespaced }
  }

  private extractDoc(src: string): string | undefined {
    const lines = src.split("\n")
    const docLines: string[] = []
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith("///") && !trimmed.startsWith("////")) {
        docLines.push(trimmed.replace(/^\/\/\/\s*/, ""))
      } else if (docLines.length > 0) {
        break
      } else if (trimmed !== "" && !trimmed.startsWith("//")) {
        break
      }
    }
    return docLines.length > 0 ? docLines.join(" ").trim() : undefined
  }

  private braceEnd(startLine: number, lines: string[]): number {
    let depth = 0
    let inStr = false
    let strChar = ""
    let inVerbatimStr = false
    for (let i = startLine - 1; i < lines.length; i++) {
      const line = lines[i]
      if (!line) continue
      let j = 0
      while (j < line.length) {
        const c = line[j]
        if (inVerbatimStr) {
          if (c === '"' && line[j + 1] === '"') {
            j += 2
            continue
          } else if (c === '"') {
            inVerbatimStr = false
            j++
            continue
          }
          j++
          continue
        }
        if (!inStr) {
          if (c === '"') {
            if (line.substring(j, j + 3) === "@\"") {
              inVerbatimStr = true
              j += 2
              continue
            }
            inStr = true
            strChar = c
          } else if (c === "{") {
            depth++
          } else if (c === "}") {
            depth--
            if (depth === 0) return i + 1
          }
        } else {
          if (c === strChar && line[j - 1] !== "\\") {
            inStr = false
          }
        }
        j++
      }
    }
    return lines.length
  }

  private lineNum(charIdx: number, lines: string[]): number {
    let count = 0
    for (let i = 0; i < lines.length; i++) {
      count += (lines[i]?.length ?? 0) + 1
      if (count > charIdx) return i + 1
    }
    return lines.length
  }

  private isSystemOrExternal(usingPath: string): boolean {
    if (usingPath.startsWith("System") || usingPath.startsWith("Microsoft")) return true
    if (usingPath.startsWith("NETStandard") || usingPath.startsWith("NETCore")) return true
    return false
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

const CLASS_RE = /\b((?:public|private|protected|internal|abstract|sealed|static|partial)\s+)*class\s+(\w+)/g
const STRUCT_RE = /\b((?:public|private|protected|internal|readonly)\s+)*struct\s+(\w+)/g
const INTERFACE_RE = /\b((?:public|private|protected|internal)\s+)*interface\s+(\w+)/g
const ENUM_RE = /\b((?:public|private|protected|internal)\s+)*enum\s+(\w+)/g
const DELEGATE_RE = /\b((?:public|private|protected|internal)\s+)*delegate\s+\w+\s+(\w+)\s*\(/g
const RECORD_RE = /\b((?:public|private|protected|internal|sealed)\s+)*record\s+(\w+)/g
const METHOD_RE = /\b((?:public|private|protected|internal|static|readonly|virtual|override|abstract|sealed|extern|async)\s+)*\w+\s+(\w+)\s*\(([^)]*)\)\s*(?:[:{])/g
const PROPERTY_RE = /\b((?:public|private|protected|internal|static|readonly|virtual|override|abstract|sealed|extern)\s+)*(\w+)\s+(\w+)\s*\{/g
const CTOR_RE = /\b((?:public|private|protected|internal|static)\s+)(\w+)\s*\(/g
const USING_RE = /^using\s+([^;]+);/gm
const NAMESPACE_RE = /^namespace\s+([\w.]+)/gm
