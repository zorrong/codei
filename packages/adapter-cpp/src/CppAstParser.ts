/**
 * CppAstParser — parse C/C++ source files using regex-based extraction.
 * Extracts: classes, structs, enums, unions, namespaces, templates, functions, methods, typedefs, using aliases, includes.
 * Note: C++ is complex (templates, preprocessor, headers); this parser covers the most common patterns.
 */

import * as fs from "fs"
import * as path from "path"
import type { RawSymbol, ParsedFile } from "@pnftrading/codei-core"

const CPP_KEYWORDS = new Set([
  "alignas", "alignof", "and", "and_eq", "asm", "auto", "bitand", "bitor", "bool", "break",
  "case", "catch", "char", "char8_t", "char16_t", "char32_t", "class", "compl", "concept",
  "const", "consteval", "constexpr", "constinit", "const_cast", "continue", "co_await", "co_return",
  "co_yield", "decltype", "default", "delete", "do", "double", "dynamic_cast", "else", "enum",
  "explicit", "export", "extern", "false", "float", "for", "friend", "goto", "if", "inline",
  "int", "long", "mutable", "namespace", "new", "noexcept", "not", "not_eq", "nullptr",
  "operator", "or", "or_eq", "private", "protected", "public", "register", "reinterpret_cast",
  "requires", "return", "short", "signed", "sizeof", "static", "static_assert", "static_cast",
  "struct", "switch", "template", "this", "thread_local", "throw", "true", "try", "typedef",
  "typeid", "typename", "union", "unsigned", "using", "virtual", "void", "volatile", "wchar_t",
  "while", "xor", "xor_eq", "override", "final", "noexcept", "constexpr", "nullptr",
])

export class CppAstParser {
  constructor(private readonly projectRoot: string) {}

  async parseFile(filePath: string): Promise<ParsedFile> {
    const content = fs.readFileSync(filePath, "utf-8")
    const lines = content.split("\n")
    const symbols: RawSymbol[] = []

    const classes = this.extractClasses(content, lines)
    const structs = this.extractStructs(content, lines)
    const enums = this.extractEnums(content, lines)
    const unions = this.extractUnions(content, lines)
    const namespaces = this.extractNamespaces(content, lines)
    const templates = this.extractTemplates(content, lines)
    const functions = this.extractFunctions(content, lines)
    const methods = this.extractMethods(content, lines)
    const typedefs = this.extractTypedefs(content, lines)
    const usingAliases = this.extractUsingAliases(content, lines)

    symbols.push(...classes, ...structs, ...enums, ...unions, ...namespaces, ...templates, ...functions, ...methods, ...typedefs, ...usingAliases)

    const { includes, macroDefs } = this.extractIncludesAndMacros(content)

    const internalImports: string[] = []
    const externalImports: string[] = []

    for (const inc of includes) {
      if (this.isSystemInclude(inc)) {
        externalImports.push(inc)
      } else {
        internalImports.push(inc)
      }
    }

    const exports = symbols.filter((s) => s.isExported).map((s) => s.name)

    return {
      filePath,
      relativePath: path.relative(this.projectRoot, filePath),
      language: "cpp",
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

  private extractEnums(content: string, lines: string[]): RawSymbol[] {
    const enums: RawSymbol[] = []
    for (const m of this.findAll(content, ENUM_RE)) {
      const name = m[1]
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

  private extractUnions(content: string, lines: string[]): RawSymbol[] {
    const unions: RawSymbol[] = []
    for (const m of this.findAll(content, UNION_RE)) {
      const name = m[1]
      if (!name) continue
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.braceEnd(startLine, lines)
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      const docComment = this.extractDoc(fullSource)
      unions.push({
        name,
        kind: "struct",
        signature: `union ${name}`,
        startLine,
        endLine,
        fullSource,
        isExported: false,
        docComment,
      })
    }
    return unions
  }

  private extractNamespaces(content: string, lines: string[]): RawSymbol[] {
    const namespaces: RawSymbol[] = []
    for (const m of this.findAll(content, NAMESPACE_RE)) {
      const name = m[1]
      if (!name) continue
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.braceEnd(startLine, lines)
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      namespaces.push({
        name,
        kind: "module",
        signature: `namespace ${name}`,
        startLine,
        endLine,
        fullSource,
        isExported: false,
        docComment: undefined,
      })
    }
    return namespaces
  }

  private extractTemplates(content: string, lines: string[]): RawSymbol[] {
    const templates: RawSymbol[] = []
    for (const m of this.findAll(content, TEMPLATE_CLASS_RE)) {
      const name = m[2]
      if (!name) continue
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.braceEnd(startLine, lines)
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      const docComment = this.extractDoc(fullSource)
      const isExported = Boolean(m[0].match(/\bpublic\b/))
      templates.push({
        name,
        kind: "class",
        signature: `template<typename T> class ${name}`,
        startLine,
        endLine,
        fullSource,
        isExported,
        docComment,
      })
    }
    return templates
  }

  private extractFunctions(content: string, lines: string[]): RawSymbol[] {
    const functions: RawSymbol[] = []
    for (const m of this.findAll(content, FUNC_RE)) {
      const name = m[2]
      if (!name || CPP_KEYWORDS.has(name)) continue
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.braceEnd(startLine, lines)
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      const docComment = this.extractDoc(fullSource)
      const isExported = Boolean(m[0].match(/\bpublic\b/))
      const retType = m[1] ?? "void"
      functions.push({
        name,
        kind: "function",
        signature: `${retType} ${name}(...)`,
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
      const name = m[3]
      if (!name || CPP_KEYWORDS.has(name)) continue
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.braceEnd(startLine, lines)
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      const docComment = this.extractDoc(fullSource)
      const isExported = Boolean(m[0].match(/\bpublic\b/))
      const retType = m[2] ?? "void"
      methods.push({
        name,
        kind: "method",
        signature: `${retType} ${name}(...)`,
        startLine,
        endLine,
        fullSource,
        isExported,
        docComment,
      })
    }
    return methods
  }

  private extractTypedefs(content: string, lines: string[]): RawSymbol[] {
    const typedefs: RawSymbol[] = []
    for (const m of this.findAll(content, TYPEDEF_RE)) {
      const name = m[1]
      if (!name) continue
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.lineNum((m.index ?? 0) + m[0].length, lines)
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      const docComment = this.extractDoc(fullSource)
      typedefs.push({
        name,
        kind: "type",
        signature: `typedef ${name}`,
        startLine,
        endLine,
        fullSource,
        isExported: false,
        docComment,
      })
    }
    return typedefs
  }

  private extractUsingAliases(content: string, lines: string[]): RawSymbol[] {
    const aliases: RawSymbol[] = []
    for (const m of this.findAll(content, USING_ALIAS_RE)) {
      const name = m[1]
      if (!name) continue
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.lineNum((m.index ?? 0) + m[0].length, lines)
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      const docComment = this.extractDoc(fullSource)
      aliases.push({
        name,
        kind: "type",
        signature: `using ${name} = ...`,
        startLine,
        endLine,
        fullSource,
        isExported: false,
        docComment,
      })
    }
    return aliases
  }

  private extractIncludesAndMacros(content: string): { includes: string[]; macroDefs: string[] } {
    const includes: string[] = []
    const macroDefs: string[] = []

    for (const m of this.findAll(content, INCLUDE_RE)) {
      const inc = m[1] ?? m[2]
      if (inc) includes.push(inc)
    }

    for (const m of this.findAll(content, DEFINE_RE)) {
      const def = m[1]
      if (def) macroDefs.push(def)
    }

    return { includes, macroDefs }
  }

  private extractDoc(src: string): string | undefined {
    const lines = src.split("\n")
    const docLines: string[] = []
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith("///") && !trimmed.startsWith("////")) {
        docLines.push(trimmed.replace(/^\/\/\/\s*/, ""))
      } else if (trimmed.startsWith("/*")) {
        continue
      } else if (trimmed.startsWith("*/") && docLines.length > 0) {
        break
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
    let inChar = false
    for (let i = startLine - 1; i < lines.length; i++) {
      const line = lines[i]
      if (!line) continue
      for (let j = 0; j < line.length; j++) {
        const c = line[j]
        if (inChar) {
          if (c === "'" && line[j - 1] !== "\\") inChar = false
          continue
        }
        if (!inStr) {
          if (c === '"') {
            inStr = true
            strChar = c
          } else if (c === "'") {
            inChar = true
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

  private isSystemInclude(inc: string): boolean {
    if (inc.startsWith("<")) return true
    if (inc.startsWith("\"cstd")) return true
    if (inc.startsWith("\"cpp")) return true
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

const CLASS_RE = /\b((?:public|private|protected)\s+)*class\s+(\w+)/g
const STRUCT_RE = /\b((?:public|private|protected)\s+)*struct\s+(\w+)/g
const ENUM_RE = /\benum\s+(?:class\s+)?(\w+)/g
const UNION_RE = /\bunion\s+(\w+)/g
const NAMESPACE_RE = /\bnamespace\s+(\w+)/g
const TEMPLATE_CLASS_RE = /\btemplate\s*<[^>]+>\s*((?:public|private|protected)\s+)*class\s+(\w+)/g
const FUNC_RE = /\b((?:inline|static|extern|constexpr|void|int|float|double|char|bool|long|auto|auto\s+\*|unsigned|signed)\s+)([\w_][\w0-9_]*)\s*\(/g
const METHOD_RE = /\b((?:public|private|protected)\s+)*((?:inline|static|virtual|override|constexpr|void|int|float|double|char|bool|long|auto|unsigned|signed)\s+)([\w_][\w0-9_]*)\s*\(/g
const TYPEDEF_RE = /\btypedef\s+[\w:&<>\s]+\s+(\w+)\s*;/g
const USING_ALIAS_RE = /\busing\s+(\w+)\s*=/g
const INCLUDE_RE = /#include\s*[<"]([^>"]+)[>"]/g
const DEFINE_RE = /#define\s+([A-Z_][A-Z0-9_]*)/g
