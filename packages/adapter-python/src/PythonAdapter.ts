/**
 * PythonAdapter — implement LanguageAdapter cho Python.
 * Dùng Python's ast module để parse source code.
 */

import type { LanguageAdapter, ParsedFile } from "@pnftrading/codei-core"
import * as path from "path"
import { PythonAstParser } from "./PythonAstParser.js"
import { PythonDependencyResolver } from "./PythonDependencyResolver.js"

export interface PythonAdapterOptions {
  pythonPath?: string
}

export class PythonAdapter implements LanguageAdapter {
  readonly language = "python" as const
  readonly fileExtensions = [".py"]

  private parsers: Map<string, PythonAstParser> = new Map()
  private readonly dependencyResolver: PythonDependencyResolver

  constructor(_options: PythonAdapterOptions = {}) {
    this.dependencyResolver = new PythonDependencyResolver()
  }

  supports(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase()
    return this.fileExtensions.includes(ext)
  }

  async parseFile(filePath: string, projectRoot: string): Promise<ParsedFile> {
    const parser = this.getOrCreateParser(projectRoot)
    return parser.parseFile(filePath)
  }

  async resolveImport(
    importString: string,
    fromFile: string,
    projectRoot: string
  ): Promise<string | null> {
    return this.dependencyResolver.resolveImport(importString, fromFile, projectRoot)
  }

  private getOrCreateParser(projectRoot: string): PythonAstParser {
    if (!this.parsers.has(projectRoot)) {
      this.parsers.set(projectRoot, new PythonAstParser(projectRoot))
    }
    return this.parsers.get(projectRoot)!
  }
}
