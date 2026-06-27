/**
 * CSharpAdapter — implement LanguageAdapter for C#.
 */

import type { LanguageAdapter, ParsedFile } from "@pnftrading/codei-core"
import * as path from "path"
import { CSharpAstParser } from "./CSharpAstParser.js"
import { CSharpDependencyResolver } from "./CSharpDependencyResolver.js"

export interface CSharpAdapterOptions {
  csharpPath?: string
}

export class CSharpAdapter implements LanguageAdapter {
  readonly language = "csharp" as const
  readonly fileExtensions = [".cs"]

  private parsers: Map<string, CSharpAstParser> = new Map()
  private readonly dependencyResolver: CSharpDependencyResolver

  constructor(_options: CSharpAdapterOptions = {}) {
    this.dependencyResolver = new CSharpDependencyResolver()
  }

  supports(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase()
    return this.fileExtensions.includes(ext)
  }

  async parseFile(filePath: string, projectRoot: string): Promise<ParsedFile> {
    const parser = this.getOrCreateParser(projectRoot)
    return parser.parseFile(filePath)
  }

  async resolveImport(usingPath: string, fromFile: string, projectRoot: string): Promise<string | null> {
    return this.dependencyResolver.resolveImport(usingPath, fromFile, projectRoot)
  }

  private getOrCreateParser(projectRoot: string): CSharpAstParser {
    if (!this.parsers.has(projectRoot)) {
      this.parsers.set(projectRoot, new CSharpAstParser(projectRoot))
    }
    return this.parsers.get(projectRoot)!
  }
}
