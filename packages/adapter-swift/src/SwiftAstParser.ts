/**
 * SwiftAstParser — parse Swift source files using regex-based extraction.
 * Extracts: classes, structs, enums, protocols, extensions, functions, methods, initializers, subscripts, properties, typealiases, imports.
 */

import * as fs from "fs"
import * as path from "path"
import type { RawSymbol, ParsedFile } from "@pnftrading/codei-core"

const SWIFT_KEYWORDS = new Set([
  "actor", "any", "as", "associatedtype", "async", "await", "break", "case", "catch",
  "class", "continue", "convenience", "default", "defer", "deinit", "didSet", "do",
  "else", "enum", "extension", "fallthrough", "false", "fileprivate", "final", "for",
  "func", "get", "guard", "if", "import", "in", "indirect", "infix", "init", "inout",
  "internal", "is", "isolated", "lazy", "let", "mutating", "nil", "nonisolated", "nonmutating",
  "open", "operator", "optional", "override", "postfix", "precedencegroup", "prefix",
  "private", "protocol", "public", "repeat", "required", "rethrows", "return", "self",
  "Self", "set", "some", "static", "struct", "subscript", "super", "switch", "throw",
  "throws", "true", "try", "typealias", "unowned", "var", "weak", "where", "while", "willSet",
])

export class SwiftAstParser {
  constructor(private readonly projectRoot: string) {}

  async parseFile(filePath: string): Promise<ParsedFile> {
    const content = fs.readFileSync(filePath, "utf-8")
    const lines = content.split("\n")
    const symbols: RawSymbol[] = []

    const classes = this.extractClasses(content, lines)
    const structs = this.extractStructs(content, lines)
    const enums = this.extractEnums(content, lines)
    const protocols = this.extractProtocols(content, lines)
    const extensions = this.extractExtensions(content, lines)
    const functions = this.extractFunctions(content, lines)
    const methods = this.extractMethods(content, lines)
    const initializers = this.extractInitializers(content, lines)
    const subscripts = this.extractSubscripts(content, lines)
    const properties = this.extractProperties(content, lines)
    const typealiases = this.extractTypealiases(content, lines)

    symbols.push(...classes, ...structs, ...enums, ...protocols, ...extensions, ...functions, ...methods, ...initializers, ...subscripts, ...properties, ...typealiases)

    const { imports } = this.extractImports(content)

    const internalImports: string[] = []
    const externalImports: string[] = []

    for (const imp of imports) {
      if (this.isSwiftCoreOrSystem(imp)) {
        externalImports.push(imp)
      } else {
        internalImports.push(imp)
      }
    }

    const exports = symbols.filter((s) => s.isExported).map((s) => s.name)

    return {
      filePath,
      relativePath: path.relative(this.projectRoot, filePath),
      language: "swift",
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
      const isExported = Boolean(m[0].match(/\bpublic\b/) || m[0].match(/\bopen\b/))
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

  private extractProtocols(content: string, lines: string[]): RawSymbol[] {
    const protocols: RawSymbol[] = []
    for (const m of this.findAll(content, PROTOCOL_RE)) {
      const name = m[2]
      if (!name) continue
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.braceEnd(startLine, lines)
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      const docComment = this.extractDoc(fullSource)
      protocols.push({
        name,
        kind: "interface",
        signature: `protocol ${name}`,
        startLine,
        endLine,
        fullSource,
        isExported: true,
        docComment,
      })
    }
    return protocols
  }

  private extractExtensions(content: string, lines: string[]): RawSymbol[] {
    const extensions: RawSymbol[] = []
    for (const m of this.findAll(content, EXTENSION_RE)) {
      const name = m[1]
      if (!name) continue
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.braceEnd(startLine, lines)
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      extensions.push({
        name,
        kind: "class",
        signature: `extension ${name}`,
        startLine,
        endLine,
        fullSource,
        isExported: false,
        docComment: undefined,
      })
    }
    return extensions
  }

  private extractFunctions(content: string, lines: string[]): RawSymbol[] {
    const functions: RawSymbol[] = []
    for (const m of this.findAll(content, FUNC_RE)) {
      const name = m[2]
      if (!name || name === "_" || SWIFT_KEYWORDS.has(name)) continue
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.braceEnd(startLine, lines)
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      const docComment = this.extractDoc(fullSource)
      const isExported = Boolean(m[0].match(/\bpublic\b/) || m[0].match(/\bopen\b/))
      functions.push({
        name,
        kind: "function",
        signature: `func ${name}(...)`,
        startLine,
        endLine,
        fullSource,
        isExported,
        docComment,
      })
    }
    return functions
  }

  private extractMethods(content: string, lines: string[]): RawSymbol[] {
    const methods: RawSymbol[] = []
    for (const m of this.findAll(content, METHOD_RE)) {
      const name = m[2]
      if (!name || name === "_" || SWIFT_KEYWORDS.has(name)) continue
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.braceEnd(startLine, lines)
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      const docComment = this.extractDoc(fullSource)
      const isExported = Boolean(m[0].match(/\bpublic\b/) || m[0].match(/\bopen\b/))
      methods.push({
        name,
        kind: "method",
        signature: `func ${name}(...)`,
        startLine,
        endLine,
        fullSource,
        isExported,
        docComment,
      })
    }
    return methods
  }

  private extractInitializers(content: string, lines: string[]): RawSymbol[] {
    const initers: RawSymbol[] = []
    for (const m of this.findAll(content, INIT_RE)) {
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.braceEnd(startLine, lines)
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      initers.push({
        name: "init",
        kind: "method",
        signature: "init(...)",
        startLine,
        endLine,
        fullSource,
        isExported: true,
        docComment: this.extractDoc(fullSource),
      })
    }
    return initers
  }

  private extractSubscripts(content: string, lines: string[]): RawSymbol[] {
    const subs: RawSymbol[] = []
    for (const m of this.findAll(content, SUBSCRIPT_RE)) {
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.braceEnd(startLine, lines)
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      subs.push({
        name: "subscript",
        kind: "method",
        signature: "subscript(...)",
        startLine,
        endLine,
        fullSource,
        isExported: Boolean(m[0].match(/\bpublic\b/)),
        docComment: this.extractDoc(fullSource),
      })
    }
    return subs
  }

  private extractProperties(content: string, lines: string[]): RawSymbol[] {
    const props: RawSymbol[] = []
    for (const m of this.findAll(content, PROP_RE)) {
      const name = m[2]
      if (!name || SWIFT_KEYWORDS.has(name)) continue
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.lineNum((m.index ?? 0) + m[0].length, lines)
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      props.push({
        name,
        kind: "property",
        signature: `var ${name}`,
        startLine,
        endLine,
        fullSource,
        isExported: Boolean(m[0].match(/\bpublic\b/)),
        docComment: undefined,
      })
    }
    return props
  }

  private extractTypealiases(content: string, lines: string[]): RawSymbol[] {
    const aliases: RawSymbol[] = []
    for (const m of this.findAll(content, TYPEALIAS_RE)) {
      const name = m[2]
      if (!name) continue
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.lineNum((m.index ?? 0) + m[0].length, lines)
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      aliases.push({
        name,
        kind: "type",
        signature: `typealias ${name}`,
        startLine,
        endLine,
        fullSource,
        isExported: Boolean(m[0].match(/\bpublic\b/)),
        docComment: this.extractDoc(fullSource),
      })
    }
    return aliases
  }

  private extractImports(content: string): { imports: string[] } {
    const imports: string[] = []
    for (const m of this.findAll(content, IMPORT_RE)) {
      const imp = m[1]
      if (imp) imports.push(imp)
    }
    return { imports }
  }

  private extractDoc(src: string): string | undefined {
    const lines = src.split("\n")
    const docLines: string[] = []
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith("///") && !trimmed.startsWith("////")) {
        docLines.push(trimmed.replace(/^\/\/\/\s*/, ""))
      } else if (trimmed.startsWith("/**")) {
        continue
      } else if (trimmed.startsWith("*/") && docLines.length > 0) {
        break
      } else if (docLines.length > 0 && trimmed.startsWith("*")) {
        docLines.push(trimmed.replace(/^\*\s*/, ""))
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
    for (let i = startLine - 1; i < lines.length; i++) {
      const line = lines[i]
      if (!line) continue
      for (let j = 0; j < line.length; j++) {
        const c = line[j]
        if (!inStr) {
          if (c === '"') {
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

  private isSwiftCoreOrSystem(importPath: string): boolean {
    if (importPath.startsWith("Swift")) return true
    if (importPath.startsWith("Foundation")) return true
    if (importPath.startsWith("UIKit")) return true
    if (importPath.startsWith("AppKit")) return true
    if (importPath.startsWith("Darwin")) return true
    if (importPath.startsWith("ObjectiveC")) return true
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

const CLASS_RE = /\b((?:public|open|final|abstract|lazy|weak|unowned|private|fileprivate|internal)\s+)*class\s+(\w+)/g
const STRUCT_RE = /\b((?:public|open|final|lazy|weak|unowned|private|fileprivate|internal)\s+)*struct\s+(\w+)/g
const ENUM_RE = /\b((?:public|open|indirect)\s+)*enum\s+(\w+)/g
const PROTOCOL_RE = /\b((?:public|open|indirect)\s+)*protocol\s+(\w+)/g
const EXTENSION_RE = /\bextension\s+(\w+)/g
const FUNC_RE = /\b((?:public|open|internal|fileprivate|private|static|class|mutating|nonmutating|override)\s+)*func\s+(\w+)/g
const METHOD_RE = /\b((?:public|open|internal|fileprivate|private|static|class|mutating|nonmutating|override)\s+)*func\s+(\w+)/g
const INIT_RE = /\b((?:public|open|internal|fileprivate|private|convenience|required)\s+)*init\s*\(/g
const SUBSCRIPT_RE = /\b((?:public|open|internal|fileprivate|private)\s+)*subscript\s*\(/g
const PROP_RE = /\b((?:public|open|internal|fileprivate|private|lazy|weak|unowned|static|class|mutating|nonmutating)\s+)*(?:var|let)\s+(\w+)/g
const TYPEALIAS_RE = /\b((?:public|open|internal|fileprivate|private)\s+)*typealias\s+(\w+)/g
const IMPORT_RE = /^import\s+(\w+)/gm
