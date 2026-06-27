/**
 * CppAdapter — implement LanguageAdapter for C/C++.
 */

import type { LanguageAdapter, ParsedFile } from "@pnftrading/codei-core"
import * as path from "path"
import { CppAstParser } from "./CppAstParser.js"
import { CppDependencyResolver } from "./CppDependencyResolver.js"

export interface CppAdapterOptions {
  cppPath?: string
}

export class CppAdapter implements LanguageAdapter {
  readonly language = "cpp" as const
  readonly fileExtensions = [".cpp", ".cc", ".cxx", ".hpp", ".h", ".hh", ".hxx", ".c"]

  private parsers: Map<string, CppAstParser> = new Map()
  private readonly dependencyResolver: CppDependencyResolver

  constructor(_options: CppAdapterOptions = {}) {
    this.dependencyResolver = new CppDependencyResolver()
  }

  supports(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase()
    return this.fileExtensions.includes(ext)
  }

  async parseFile(filePath: string, projectRoot: string): Promise<ParsedFile> {
    const parser = this.getOrCreateParser(projectRoot)
    return parser.parseFile(filePath)
  }

  async resolveImport(includePath: string, fromFile: string, projectRoot: string): Promise<string | null> {
    return this.dependencyResolver.resolveImport(includePath, fromFile, projectRoot)
  }

  private getOrCreateParser(projectRoot: string): CppAstParser {
    if (!this.parsers.has(projectRoot)) {
      this.parsers.set(projectRoot, new CppAstParser(projectRoot))
    }
    return this.parsers.get(projectRoot)!
  }
}
