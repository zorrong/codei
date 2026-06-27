/**
 * RustAdapter — implement LanguageAdapter for Rust.
 */

import type { LanguageAdapter, ParsedFile } from "pnftrading_codei-core"
import * as path from "path"
import { RustAstParser } from "./RustAstParser.js"
import { RustDependencyResolver } from "./RustDependencyResolver.js"

export interface RustAdapterOptions {
  rustPath?: string
}

export class RustAdapter implements LanguageAdapter {
  readonly language = "rust" as const
  readonly fileExtensions = [".rs"]

  private parsers: Map<string, RustAstParser> = new Map()
  private readonly dependencyResolver: RustDependencyResolver

  constructor(_options: RustAdapterOptions = {}) {
    this.dependencyResolver = new RustDependencyResolver()
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

  private getOrCreateParser(projectRoot: string): RustAstParser {
    if (!this.parsers.has(projectRoot)) {
      this.parsers.set(projectRoot, new RustAstParser(projectRoot))
    }
    return this.parsers.get(projectRoot)!
  }
}
