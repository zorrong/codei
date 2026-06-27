/**
 * JavaAdapter — implement LanguageAdapter for Java.
 */

import type { LanguageAdapter, ParsedFile } from "@pnftrading/codei-core"
import * as path from "path"
import { JavaAstParser } from "./JavaAstParser.js"
import { JavaDependencyResolver } from "./JavaDependencyResolver.js"

export interface JavaAdapterOptions {
  javaPath?: string
}

export class JavaAdapter implements LanguageAdapter {
  readonly language = "java" as const
  readonly fileExtensions = [".java"]

  private parsers: Map<string, JavaAstParser> = new Map()
  private readonly dependencyResolver: JavaDependencyResolver

  constructor(_options: JavaAdapterOptions = {}) {
    this.dependencyResolver = new JavaDependencyResolver()
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

  private getOrCreateParser(projectRoot: string): JavaAstParser {
    if (!this.parsers.has(projectRoot)) {
      this.parsers.set(projectRoot, new JavaAstParser(projectRoot))
    }
    return this.parsers.get(projectRoot)!
  }
}
