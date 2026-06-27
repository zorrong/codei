/**
 * GoAdapter — implement LanguageAdapter for Go.
 */

import type { LanguageAdapter, ParsedFile } from "pnftrading_codei-core"
import * as path from "path"
import { GoAstParser } from "./GoAstParser.js"
import { GoDependencyResolver } from "./GoDependencyResolver.js"

export interface GoAdapterOptions {
  goPath?: string
}

export class GoAdapter implements LanguageAdapter {
  readonly language = "go" as const
  readonly fileExtensions = [".go"]

  private parsers: Map<string, GoAstParser> = new Map()
  private readonly dependencyResolver: GoDependencyResolver

  constructor(_options: GoAdapterOptions = {}) {
    this.dependencyResolver = new GoDependencyResolver()
  }

  supports(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase()
    return this.fileExtensions.includes(ext)
  }

  async parseFile(filePath: string, projectRoot: string): Promise<ParsedFile> {
    const parser = this.getOrCreateParser(projectRoot)
    return parser.parseFile(filePath)
  }

  async resolveImport(importPath: string, fromFile: string, projectRoot: string): Promise<string | null> {
    return this.dependencyResolver.resolveImport(importPath, fromFile, projectRoot)
  }

  private getOrCreateParser(projectRoot: string): GoAstParser {
    if (!this.parsers.has(projectRoot)) {
      this.parsers.set(projectRoot, new GoAstParser(projectRoot))
    }
    return this.parsers.get(projectRoot)!
  }
}
