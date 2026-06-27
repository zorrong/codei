/**
 * SwiftAdapter — implement LanguageAdapter for Swift.
 */

import type { LanguageAdapter, ParsedFile } from "@pnftrading/codei-core"
import * as path from "path"
import { SwiftAstParser } from "./SwiftAstParser.js"
import { SwiftDependencyResolver } from "./SwiftDependencyResolver.js"

export interface SwiftAdapterOptions {
  swiftPath?: string
}

export class SwiftAdapter implements LanguageAdapter {
  readonly language = "swift" as const
  readonly fileExtensions = [".swift"]

  private parsers: Map<string, SwiftAstParser> = new Map()
  private readonly dependencyResolver: SwiftDependencyResolver

  constructor(_options: SwiftAdapterOptions = {}) {
    this.dependencyResolver = new SwiftDependencyResolver()
  }

  supports(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase()
    return this.fileExtensions.includes(ext)
  }

  async parseFile(filePath: string, projectRoot: string): Promise<ParsedFile> {
    const parser = this.getOrCreateParser(projectRoot)
    return parser.parseFile(filePath)
  }

  async resolveImport(moduleName: string, fromFile: string, projectRoot: string): Promise<string | null> {
    return this.dependencyResolver.resolveImport(moduleName, fromFile, projectRoot)
  }

  private getOrCreateParser(projectRoot: string): SwiftAstParser {
    if (!this.parsers.has(projectRoot)) {
      this.parsers.set(projectRoot, new SwiftAstParser(projectRoot))
    }
    return this.parsers.get(projectRoot)!
  }
}