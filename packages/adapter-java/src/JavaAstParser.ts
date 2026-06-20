/**
 * JavaAstParser — parse Java source files using regex-based extraction.
 * Extracts: classes, interfaces, enums, records, annotations, methods, fields, constructors, packages, imports.
 */

import * as fs from "fs"
import * as path from "path"
import type { RawSymbol, ParsedFile } from "@codeindex/core"

const JAVA_KEYWORDS = new Set([
  "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "checked",
  "class", "const", "continue", "default", "do", "double", "else", "enum", "extends",
  "final", "finally", "float", "for", "goto", "if", "implements", "import", "instanceof",
  "int", "interface", "long", "native", "new", "package", "private", "protected", "public",
  "return", "short", "static", "strictfp", "super", "switch", "synchronized", "this",
  "throw", "throws", "transient", "try", "void", "volatile", "while", "true", "false", "null",
  "var", "record", "sealed", "non-sealed", "permits", "yield", "sealed", "instanceof",
])

export class JavaAstParser {
  constructor(private readonly projectRoot: string) {}

  async parseFile(filePath: string): Promise<ParsedFile> {
    const content = fs.readFileSync(filePath, "utf-8")
    const lines = content.split("\n")
    const symbols: RawSymbol[] = []

    const classes = this.extractClasses(content, lines)
    const interfaces = this.extractInterfaces(content, lines)
    const enums = this.extractEnums(content, lines)
    const records = this.extractRecords(content, lines)
    const annotations = this.extractAnnotations(content, lines)
    const methods = this.extractMethods(content, lines)
    const fields = this.extractFields(content, lines)
    const constructors = this.extractConstructors(content, lines)

    symbols.push(...classes, ...interfaces, ...enums, ...records, ...annotations, ...methods, ...fields, ...constructors)

    const { imports, packageName } = this.extractImportsAndPackage(content)

    const internalImports: string[] = []
    const externalImports: string[] = []

    for (const imp of imports) {
      if (this.isJavaLangOrExternal(imp)) {
        externalImports.push(imp)
      } else {
        internalImports.push(imp)
      }
    }

    const exports = symbols.filter((s) => s.isExported).map((s) => s.name)

    return {
      filePath,
      relativePath: path.relative(this.projectRoot, filePath),
      language: "java",
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
        signature: `record ${name}(...)`,
        startLine,
        endLine,
        fullSource,
        isExported,
        docComment,
      })
    }
    return records
  }

  private extractAnnotations(content: string, lines: string[]): RawSymbol[] {
    const annotations: RawSymbol[] = []
    for (const m of this.findAll(content, ANNOTATION_RE)) {
      const name = m[2]
      if (!name) continue
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.braceEnd(startLine, lines)
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      const docComment = this.extractDoc(fullSource)
      annotations.push({
        name,
        kind: "interface",
        signature: `@interface ${name}`,
        startLine,
        endLine,
        fullSource,
        isExported: true,
        docComment,
      })
    }
    return annotations
  }

  private extractMethods(content: string, lines: string[]): RawSymbol[] {
    const methods: RawSymbol[] = []
    for (const m of this.findAll(content, METHOD_RE)) {
      const name = m[3]
      if (!name || JAVA_KEYWORDS.has(name)) continue
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

  private extractFields(content: string, lines: string[]): RawSymbol[] {
    const fields: RawSymbol[] = []
    for (const m of this.findAll(content, FIELD_RE)) {
      const name = m[3]
      if (!name || JAVA_KEYWORDS.has(name)) continue
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.lineNum((m.index ?? 0) + m[0].length, lines)
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      const docComment = this.extractDoc(fullSource)
      const isExported = Boolean(m[0].match(/\bpublic\b/))
      const fieldType = m[2] ?? "var"
      fields.push({
        name,
        kind: "property",
        signature: `${fieldType} ${name}`,
        startLine,
        endLine,
        fullSource,
        isExported,
        docComment,
      })
    }
    return fields
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

  private extractImportsAndPackage(content: string): { imports: string[]; packageName: string | undefined } {
    const imports: string[] = []
    let packageName: string | undefined

    const pkgMatch = content.match(/^package\s+([\w.]+);/m)
    if (pkgMatch) packageName = pkgMatch[1]

    for (const m of this.findAll(content, IMPORT_RE)) {
      const imp = m[1]
      if (imp) imports.push(imp)
    }

    return { imports, packageName }
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

  private isJavaLangOrExternal(importPath: string): boolean {
    if (importPath.startsWith("java.lang")) return true
    if (importPath.startsWith("java.util")) return true
    if (importPath.startsWith("java.io")) return true
    if (importPath.startsWith("java.nio")) return true
    if (importPath.startsWith("java.net")) return true
    if (importPath.startsWith("java.math")) return true
    if (importPath.startsWith("java.security")) return true
    if (importPath.startsWith("javax.")) return true
    if (importPath.startsWith("sun.")) return true
    if (importPath === "java.lang.Object") return true
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

const CLASS_RE = /\b((?:public|private|protected|abstract|sealed|static|final|strictfp)\s+)*class\s+(\w+)/g
const INTERFACE_RE = /\b((?:public|private|protected|abstract)\s+)*interface\s+(\w+)/g
const ENUM_RE = /\b((?:public|private|protected|abstract|sealed)\s+)*enum\s+(\w+)/g
const RECORD_RE = /\b((?:public|private|protected|sealed)\s+)*record\s+(\w+)/g
const ANNOTATION_RE = /\b((?:public)\s+)*@interface\s+(\w+)/g
const METHOD_RE = /\b((?:public|private|protected|static|final|abstract|synchronized|native|strictfp)\s+)*(\w+)\s+(\w+)\s*\(/g
const FIELD_RE = /\b((?:public|private|protected|static|final|volatile|transient)\s+)*(\w+)\s+(\w+)/g
const CTOR_RE = /\b((?:public|private|protected)\s+)(\w+)\s*\(/g
const IMPORT_RE = /^import\s+([\w.]+);/gm
