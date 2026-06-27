/**
 * TypeScriptAdapter — implement LanguageAdapter cho TypeScript/TSX.
 * Dùng ts-morph để parse AST, DependencyResolver để resolve imports.
 */

import type { LanguageAdapter, ParsedFile, SupportedLanguage } from "pnftrading_codei-core"
import * as path from "path"
import { TsMorphParser } from "./TsMorphParser.js"
import { DependencyResolver } from "./DependencyResolver.js"

export interface TypeScriptAdapterOptions {
  /** Path tới tsconfig.json. Auto-detected nếu không chỉ định. */
  tsconfigPath?: string
}

export class TypeScriptAdapter implements LanguageAdapter {
  readonly language: SupportedLanguage = "typescript"
  readonly fileExtensions: string[] = [".ts", ".tsx"]

  private parsers: Map<string, TsMorphParser> = new Map()
  private readonly dependencyResolver: DependencyResolver
  private readonly options: TypeScriptAdapterOptions

  constructor(options: TypeScriptAdapterOptions = {}) {
    this.options = options
    this.dependencyResolver = new DependencyResolver()
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
    const resolved = this.dependencyResolver.resolveImport(
      importString,
      fromFile,
      projectRoot
    )
    if (resolved === null) return null
    return path.relative(projectRoot, resolved)
  }

  private getOrCreateParser(projectRoot: string): TsMorphParser {
    if (!this.parsers.has(projectRoot)) {
      this.parsers.set(
        projectRoot,
        new TsMorphParser({
          projectRoot,
          ...(this.options.tsconfigPath !== undefined && {
            tsconfigPath: this.options.tsconfigPath,
          }),
        })
      )
    }
    return this.parsers.get(projectRoot)!
  }
}
