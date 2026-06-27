/**
 * PhpAstParser — parse PHP source files using regex-based extraction.
 * Extracts: classes, interfaces, traits, enums, methods, functions, properties, constants, namespaces, use statements.
 */

import * as fs from "fs"
import * as path from "path"
import type { RawSymbol, ParsedFile } from "pnftrading_codei-core"

const PHP_KEYWORDS = new Set([
  "abstract", "and", "array", "as", "break", "callable", "case", "catch", "class",
  "clone", "const", "continue", "declare", "default", "die", "do", "echo", "else",
  "elseif", "empty", "enddeclare", "endfor", "endforeach", "endif", "endswitch",
  "endwhile", "eval", "exit", "extends", "final", "finally", "fn", "for", "foreach",
  "function", "global", "goto", "if", "implements", "include", "include_once",
  "instanceof", "insteadof", "interface", "isset", "list", "match", "namespace",
  "new", "or", "print", "private", "protected", "public", "require", "require_once",
  "return", "static", "switch", "throw", "trait", "try", "unset", "use", "var",
  "while", "xor", "yield", "yield from", "abstract", "enum", "final", "mixed",
  "never", "null", "false", "true", "void", "parent", "self", "static", "class",
  "extends", "implements", "trait", "interface", "abstract", "final",
])

export class PhpAstParser {
  constructor(private readonly projectRoot: string) {}

  async parseFile(filePath: string): Promise<ParsedFile> {
    const content = fs.readFileSync(filePath, "utf-8")
    const lines = content.split("\n")
    const symbols: RawSymbol[] = []

    const classes = this.extractClasses(content, lines)
    const interfaces = this.extractInterfaces(content, lines)
    const traits = this.extractTraits(content, lines)
    const enums = this.extractEnums(content, lines)
    const functions = this.extractFunctions(content, lines)
    const methods = this.extractMethods(content, lines)
    const props = this.extractProperties(content, lines)
    const constants = this.extractConstants(content, lines)

    symbols.push(...classes, ...interfaces, ...traits, ...enums, ...functions, ...methods, ...props, ...constants)

    const { uses, namespaces } = this.extractNamespacesAndUses(content)

    const internalImports: string[] = []
    const externalImports: string[] = []

    for (const u of uses) {
      if (this.isPhpCoreOrExternal(u)) {
        externalImports.push(u)
      } else {
        internalImports.push(u)
      }
    }

    const exports = symbols.filter((s) => s.isExported).map((s) => s.name)

    return {
      filePath,
      relativePath: path.relative(this.projectRoot, filePath),
      language: "php",
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
      const isExported = Boolean(m[0].match(/\bpublic\b/) || m[0].match(/\bfinal\b/) || m[0].match(/\babstract\b/))
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

  private extractInterfaces(content: string, lines: string[]): RawSymbol[] {
    const interfaces: RawSymbol[] = []
    for (const m of this.findAll(content, INTERFACE_RE)) {
      const name = m[1]
      if (!name) continue
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.braceEnd(startLine, lines)
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      const docComment = this.extractDoc(fullSource)
      interfaces.push({
        name,
        kind: "interface",
        signature: `interface ${name}`,
        startLine,
        endLine,
        fullSource,
        isExported: true,
        docComment,
      })
    }
    return interfaces
  }

  private extractTraits(content: string, lines: string[]): RawSymbol[] {
    const traits: RawSymbol[] = []
    for (const m of this.findAll(content, TRAIT_RE)) {
      const name = m[1]
      if (!name) continue
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.braceEnd(startLine, lines)
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      const docComment = this.extractDoc(fullSource)
      traits.push({
        name,
        kind: "class",
        signature: `trait ${name}`,
        startLine,
        endLine,
        fullSource,
        isExported: true,
        docComment,
      })
    }
    return traits
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
      enums.push({
        name,
        kind: "enum",
        signature: `enum ${name}`,
        startLine,
        endLine,
        fullSource,
        isExported: true,
        docComment,
      })
    }
    return enums
  }

  private extractFunctions(content: string, lines: string[]): RawSymbol[] {
    const functions: RawSymbol[] = []
    for (const m of this.findAll(content, FUNC_RE)) {
      const name = m[1]
      if (!name || PHP_KEYWORDS.has(name)) continue
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.braceEnd(startLine, lines)
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      const docComment = this.extractDoc(fullSource)
      functions.push({
        name,
        kind: "function",
        signature: `function ${name}(...)`,
        startLine,
        endLine,
        fullSource,
        isExported: true,
        docComment,
      })
    }
    return functions
  }

  private extractMethods(content: string, lines: string[]): RawSymbol[] {
    const methods: RawSymbol[] = []
    for (const m of this.findAll(content, METHOD_RE)) {
      const name = m[2]
      if (!name || name === "__construct" || name === "__destruct" || name === "__call") {
        if (name === "__construct" || name === "__destruct") {
          const startLine = this.lineNum(m.index ?? 0, lines)
          const endLine = this.braceEnd(startLine, lines)
          const fullSource = lines.slice(startLine - 1, endLine).join("\n")
          methods.push({
            name,
            kind: "method",
            signature: `function ${name}(...)`,
            startLine,
            endLine,
            fullSource,
            isExported: Boolean(m[0].match(/\bpublic\b/)),
            docComment: this.extractDoc(fullSource),
          })
        }
        continue
      }
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.braceEnd(startLine, lines)
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      const docComment = this.extractDoc(fullSource)
      methods.push({
        name,
        kind: "method",
        signature: `function ${name}(...)`,
        startLine,
        endLine,
        fullSource,
        isExported: Boolean(m[0].match(/\bpublic\b/)),
        docComment,
      })
    }
    return methods
  }

  private extractProperties(content: string, lines: string[]): RawSymbol[] {
    const props: RawSymbol[] = []
    for (const m of this.findAll(content, PROP_RE)) {
      const name = m[2]
      if (!name || name.startsWith("$")) continue
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.lineNum((m.index ?? 0) + m[0].length, lines)
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      props.push({
        name,
        kind: "property",
        signature: `$${name}`,
        startLine,
        endLine,
        fullSource,
        isExported: Boolean(m[0].match(/\bpublic\b/)),
        docComment: undefined,
      })
    }
    return props
  }

  private extractConstants(content: string, lines: string[]): RawSymbol[] {
    const constants: RawSymbol[] = []
    for (const m of this.findAll(content, CONST_RE)) {
      const name = m[1]
      if (!name) continue
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.lineNum((m.index ?? 0) + m[0].length, lines)
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      constants.push({
        name,
        kind: "constant",
        signature: `const ${name}`,
        startLine,
        endLine,
        fullSource,
        isExported: true,
        docComment: undefined,
      })
    }
    return constants
  }

  private extractNamespacesAndUses(content: string): { uses: string[]; namespaces: string[] } {
    const uses: string[] = []
    const namespaces: string[] = []

    for (const m of this.findAll(content, USE_RE)) {
      const usePath = m[1]
      if (usePath) uses.push(usePath)
    }

    for (const m of this.findAll(content, NAMESPACE_RE)) {
      const ns = m[1]
      if (ns) namespaces.push(ns)
    }

    return { uses, namespaces }
  }

  private extractDoc(src: string): string | undefined {
    const lines = src.split("\n")
    const docLines: string[] = []
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith("/**") && !trimmed.startsWith("/***")) {
        continue
      } else if (trimmed.startsWith("*") && docLines.length > 0) {
        docLines.push(trimmed.replace(/^\*\s*/, ""))
      } else if (trimmed.startsWith("*/") && docLines.length > 0) {
        break
      } else if (docLines.length > 0) {
        break
      } else if (trimmed !== "" && !trimmed.startsWith("//") && !trimmed.startsWith("#")) {
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
          if (c === '"' || c === "'") {
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

  private isPhpCoreOrExternal(usePath: string): boolean {
    if (usePath.startsWith("php\\")) return true
    if (usePath.startsWith("app\\")) return false
    if (usePath.startsWith("database\\")) return false
    if (usePath.startsWith("Illuminate\\")) return true
    if (usePath.startsWith("Symfony\\")) return true
    if (usePath.startsWith("Laravel\\")) return true
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

const CLASS_RE = /\b((?:abstract|final|readonly)\s+)*class\s+(\w+)/g
const INTERFACE_RE = /\binterface\s+(\w+)/g
const TRAIT_RE = /\btrait\s+(\w+)/g
const ENUM_RE = /\benum\s+(\w+)/g
const FUNC_RE = /\bfunction\s+([a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*)\s*\(/g
const METHOD_RE = /\b((?:public|private|protected|static|final|abstract)\s+)*function\s+([a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*)\s*\(/g
const PROP_RE = /\b((?:public|private|protected|static)\s+)*\$(\w+)/g
const CONST_RE = /\bconst\s+([A-Z_][A-Z0-9_]*)/g
const USE_RE = /^use\s+([\\A-Za-z0-9_]+);/gm
const NAMESPACE_RE = /^namespace\s+([\\A-Za-z0-9_\\]+);/gm
