/**
 * PhpAdapter — implement LanguageAdapter for PHP.
 */

import type { LanguageAdapter, ParsedFile } from "pnftrading_codei-core"
import * as path from "path"
import { PhpAstParser } from "./PhpAstParser.js"
import { PhpDependencyResolver } from "./PhpDependencyResolver.js"

export interface PhpAdapterOptions {
  phpPath?: string
}

export class PhpAdapter implements LanguageAdapter {
  readonly language = "php" as const
  readonly fileExtensions = [".php"]

  private parsers: Map<string, PhpAstParser> = new Map()
  private readonly dependencyResolver: PhpDependencyResolver

  constructor(_options: PhpAdapterOptions = {}) {
    this.dependencyResolver = new PhpDependencyResolver()
  }

  supports(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase()
    return this.fileExtensions.includes(ext)
  }

  async parseFile(filePath: string, projectRoot: string): Promise<ParsedFile> {
    const parser = this.getOrCreateParser(projectRoot)
    return parser.parseFile(filePath)
  }

  async resolveImport(usePath: string, fromFile: string, projectRoot: string): Promise<string | null> {
    return this.dependencyResolver.resolveImport(usePath, fromFile, projectRoot)
  }

  private getOrCreateParser(projectRoot: string): PhpAstParser {
    if (!this.parsers.has(projectRoot)) {
      this.parsers.set(projectRoot, new PhpAstParser(projectRoot))
    }
    return this.parsers.get(projectRoot)!
  }
}
