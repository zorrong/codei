/**
 * RustAstParser — parse Rust source files using regex-based extraction.
 */

import * as fs from "fs"
import * as path from "path"
import type { RawSymbol, ParsedFile } from "@pnftrading/codei-core"

const RUST_PRELUDE = new Set([
  "Option", "Result", "Vec", "Box", "String", "str", "usize", "u8", "u16", "u32", "u64", "u128",
  "i8", "i16", "i32", "i64", "i128", "isize", "f32", "f64", "bool", "char", "str", "slice",
  "Iterator", "IntoIterator", "From", "Into", "TryFrom", "TryInto", "Clone", "Copy", "Debug",
  "Display", "Default", "PartialEq", "Eq", "PartialOrd", "Ord", "Hash", "Drop", "Sized",
])

export class RustAstParser {
  constructor(private readonly projectRoot: string) {}

  async parseFile(filePath: string): Promise<ParsedFile> {
    const content = fs.readFileSync(filePath, "utf-8")
    const lines = content.split("\n")
    const symbols: RawSymbol[] = []

    const structs = this.extractStructs(content, lines)
    const enums = this.extractEnums(content, lines)
    const traits = this.extractTraits(content, lines)
    const typeAliases = this.extractTypeAliases(content, lines)
    const functions = this.extractFunctions(content, lines)
    const impls = this.extractImpls(content, lines)
    const macros = this.extractMacros(content, lines)

    symbols.push(...structs, ...enums, ...traits, ...typeAliases, ...functions, ...impls, ...macros)

    const { useItems } = this.extractUseStatements(content)

    const internalImports: string[] = []
    const externalImports: string[] = []

    for (const u of useItems) {
      if (this.isStdlibOrExternal(u)) {
        externalImports.push(u)
      } else {
        internalImports.push(u)
      }
    }

    const exports = symbols.filter((s) => s.isExported).map((s) => s.name)

    return {
      filePath,
      relativePath: path.relative(this.projectRoot, filePath),
      language: "rust",
      symbols,
      internalImports,
      externalImports,
      exports,
    }
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
      const isExported = Boolean(m[1])
      structs.push({
        name,
        kind: "class",
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
      const isExported = Boolean(m[1])
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

  private extractTraits(content: string, lines: string[]): RawSymbol[] {
    const traits: RawSymbol[] = []
    for (const m of this.findAll(content, TRAIT_RE)) {
      const name = m[2]
      if (!name) continue
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.braceEnd(startLine, lines)
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      const docComment = this.extractDoc(fullSource)
      const isExported = Boolean(m[1])
      traits.push({
        name,
        kind: "interface",
        signature: `trait ${name}`,
        startLine,
        endLine,
        fullSource,
        isExported,
        docComment,
      })
    }
    return traits
  }

  private extractTypeAliases(content: string, lines: string[]): RawSymbol[] {
    const aliases: RawSymbol[] = []
    for (const m of this.findAll(content, TYPE_RE)) {
      const name = m[2]
      if (!name) continue
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.lineNum((m.index ?? 0) + m[0].length, lines)
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      const docComment = this.extractDoc(fullSource)
      const isExported = Boolean(m[1])
      aliases.push({
        name,
        kind: "type",
        signature: `type ${name}`,
        startLine,
        endLine,
        fullSource,
        isExported,
        docComment,
      })
    }
    return aliases
  }

  private extractFunctions(content: string, lines: string[]): RawSymbol[] {
    const fns: RawSymbol[] = []
    for (const m of this.findAll(content, FN_RE)) {
      const name = m[2]
      if (!name || name === "_") continue
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.braceEnd(startLine, lines)
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      const docComment = this.extractDoc(fullSource)
      const isExported = Boolean(m[1])
      fns.push({
        name,
        kind: "function",
        signature: `fn ${name}(...)`,
        startLine,
        endLine,
        fullSource,
        isExported,
        docComment,
      })
    }
    return fns
  }

  private extractImpls(content: string, lines: string[]): RawSymbol[] {
    const impls: RawSymbol[] = []
    for (const m of this.findAll(content, IMPL_RE)) {
      const name = m[2] ?? ""
      if (!name) continue
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.braceEnd(startLine, lines)
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      const docComment = this.extractDoc(fullSource)
      const isExported = Boolean(m[1])
      const implMethods = this.extractImplMethods(fullSource, name, startLine)
      const result: RawSymbol = {
        name,
        kind: "class",
        signature: `impl ${name}`,
        startLine,
        endLine,
        fullSource,
        isExported,
        docComment,
      }
      impls.push(result)
    }
    return impls
  }

  private extractImplMethods(implSource: string, implName: string, implStartLine: number): RawSymbol[] {
    const methods: RawSymbol[] = []
    const implLines = implSource.split("\n")
    for (const m of this.findAll(implSource, IMPL_METHOD_RE)) {
      const name = m[2]
      if (!name || name === "_") continue
      const idx = m.index ?? 0
      const mStartLine = this.lineNum(idx, implLines)
      const mEndLine = implStartLine + this.braceEnd(mStartLine, implLines) - 1
      const fullSource = implLines.slice(mStartLine - 1, this.braceEnd(mStartLine, implLines)).join("\n")
      const docComment = this.extractDoc(fullSource)
      const isExported = Boolean(m[1])
      methods.push({
        name,
        kind: "method",
        signature: `fn ${name}(...)`,
        startLine: mEndLine,
        endLine: mEndLine,
        fullSource,
        isExported,
        docComment,
        parentName: implName,
      })
    }
    return methods
  }

  private extractMacros(content: string, lines: string[]): RawSymbol[] {
    const macros: RawSymbol[] = []
    for (const m of this.findAll(content, MACRO_RE)) {
      const name = m[1]
      if (!name) continue
      const startLine = this.lineNum(m.index ?? 0, lines)
      const endLine = this.braceEnd(startLine, lines)
      const fullSource = lines.slice(startLine - 1, endLine).join("\n")
      const docComment = this.extractDoc(fullSource)
      macros.push({
        name,
        kind: "function",
        signature: `macro_rules! ${name}`,
        startLine,
        endLine,
        fullSource,
        isExported: true,
        docComment,
      })
    }
    return macros
  }

  private extractUseStatements(content: string): { useItems: string[]; crateImports: string[] } {
    const useItems: string[] = []
    const crateImports: string[] = []
    for (const m of this.findAll(content, USE_RE)) {
      const usePath = m[1]
      if (usePath) {
        useItems.push(usePath)
        if (usePath.startsWith("crate::")) {
          crateImports.push(usePath)
        }
      }
    }
    return { useItems, crateImports }
  }

  private extractDoc(src: string): string | undefined {
    const lines = src.split("\n")
    const docLines: string[] = []
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith("///")) {
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
    for (let i = startLine - 1; i < lines.length; i++) {
      const line = lines[i]
      if (!line) continue
      for (let j = 0; j < line.length; j++) {
        const c = line[j]
        if (!inStr) {
          if (c === '"' || c === '\'') {
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

  private isStdlibOrExternal(usePath: string): boolean {
    const first = usePath.split("::")[0] ?? ""
    if (first === "crate" || first === "super" || first === "self") return false
    if (RUST_PRELUDE.has(first)) return true
    if (first.includes("-")) return true
    return first.includes("::")
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

const STRUCT_RE = /(?:^|\n)(pub\s+)?struct\s+(\w+)/g
const ENUM_RE = /(?:^|\n)(pub\s+)?enum\s+(\w+)/g
const TRAIT_RE = /(?:^|\n)(pub\s+)?trait\s+(\w+)/g
const TYPE_RE = /(?:^|\n)(pub\s+)?type\s+(\w+)/g
const FN_RE = /(?:^|\n)(pub\s+)?fn\s+(\w+)/g
const IMPL_RE = /(?:^|\n)(pub\s+)?impl\s+(?:<[^>]+>\s+)?(\w+)/g
const IMPL_METHOD_RE = /(?:^|\n)(pub\s+)?fn\s+(\w+)/g
const MACRO_RE = /(?:^|\n)macro_rules!\s+(\w+)/g
const USE_RE = /(?:^|\n)use\s+([^;]+);/g
