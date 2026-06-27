/**
 * TsMorphParser — quản lý ts-morph Project và parse individual files.
 * Một instance dùng cho toàn bộ indexing session để tận dụng ts-morph cache.
 */

import { Project, type SourceFile } from "ts-morph"
import * as path from "path"
import * as fs from "fs"
import type { ParsedFile } from "pnftrading_codei-core"
import { SymbolExtractor } from "./SymbolExtractor.js"
import { DependencyResolver } from "./DependencyResolver.js"

export interface TsMorphParserOptions {
  projectRoot: string
  /**
   * Path tới tsconfig.json.
   * Nếu không có, dùng default compiler options.
   */
  tsconfigPath?: string
  /**
   * Có skip files trong node_modules không.
   * Default: true
   */
  skipNodeModules?: boolean
}

export class TsMorphParser {
  private readonly project: Project
  private readonly symbolExtractor: SymbolExtractor
  private readonly dependencyResolver: DependencyResolver
  private readonly projectRoot: string

  constructor(options: TsMorphParserOptions) {
    this.projectRoot = options.projectRoot
    this.symbolExtractor = new SymbolExtractor()
    this.dependencyResolver = new DependencyResolver()

    // Tìm tsconfig nếu không được chỉ định
    const tsconfigPath =
      options.tsconfigPath ?? this.findTsConfig(options.projectRoot)

    if (tsconfigPath !== undefined) {
      this.project = new Project({
        tsConfigFilePath: tsconfigPath,
        skipAddingFilesFromTsConfig: true,
        skipFileDependencyResolution: true,
      })
    } else {
      this.project = new Project({
        compilerOptions: {
          allowJs: false,
          strict: false,
          skipLibCheck: true,
        },
        skipFileDependencyResolution: true,
      })
    }
  }

  /**
   * Parse một TypeScript file.
   */
  async parseFile(filePath: string): Promise<ParsedFile> {
    const absolutePath = path.resolve(filePath)
    const relativePath = path.relative(this.projectRoot, absolutePath)

    // Add file vào project (hoặc lấy nếu đã có)
    let sourceFile: SourceFile
    const existing = this.project.getSourceFile(absolutePath)
    if (existing) {
      // Refresh nếu file đã thay đổi trên disk
      await existing.refreshFromFileSystem()
      sourceFile = existing
    } else {
      sourceFile = this.project.addSourceFileAtPath(absolutePath)
    }

    // Extract symbols
    const symbols = this.symbolExtractor.extract(sourceFile)

    // Extract dependencies
    const { internal, external } = this.dependencyResolver.extractImports(
      sourceFile,
      this.projectRoot
    )

    // Extract exported names
    const exports = Array.from(sourceFile.getExportedDeclarations().keys())

    const importBindings: NonNullable<ParsedFile["importBindings"]> = []
    for (const importDecl of sourceFile.getImportDeclarations()) {
      const moduleSpecifier = importDecl.getModuleSpecifierValue()
      const resolved = this.dependencyResolver.resolveImport(
        moduleSpecifier,
        sourceFile.getFilePath(),
        this.projectRoot
      )
      if (resolved === null) continue

      const from = path.relative(this.projectRoot, resolved)
      const defaultImport = importDecl.getDefaultImport()?.getText()
      const namespaceImport = importDecl.getNamespaceImport()?.getText()
      const namedImports = importDecl.getNamedImports().map((n) => n.getName())
      const typeOnly = (importDecl as unknown as { isTypeOnly?: () => boolean }).isTypeOnly?.()

      importBindings.push({
        from,
        ...(defaultImport !== undefined && { defaultImport }),
        ...(namespaceImport !== undefined && { namespaceImport }),
        ...(namedImports.length > 0 && { namedImports }),
        ...(typeOnly !== undefined && { typeOnly }),
      })
    }

    return {
      filePath: absolutePath,
      relativePath,
      language: "typescript",
      symbols,
      importBindings,
      internalImports: internal.map((p) =>
        path.relative(this.projectRoot, p)
      ),
      externalImports: external,
      exports,
    }
  }

  /**
   * Parse nhiều files — batch để tận dụng ts-morph project cache.
   */
  async parseFiles(filePaths: string[]): Promise<ParsedFile[]> {
    const results: ParsedFile[] = []

    for (const filePath of filePaths) {
      try {
        const parsed = await this.parseFile(filePath)
        results.push(parsed)
      } catch (err) {
        // Log và skip file lỗi — không để 1 file broken crash toàn bộ
        console.warn(
          `[TsMorphParser] Failed to parse ${filePath}: ${(err as Error).message}`
        )
      }
    }

    return results
  }

  /**
   * Remove một file khỏi project cache (khi file bị xóa).
   */
  removeFile(filePath: string): void {
    const absolutePath = path.resolve(filePath)
    const sourceFile = this.project.getSourceFile(absolutePath)
    if (sourceFile) {
      this.project.removeSourceFile(sourceFile)
    }
  }

  /**
   * Tìm tsconfig.json từ project root đi lên.
   */
  private findTsConfig(startDir: string): string | undefined {
    let current = startDir
    const root = path.parse(current).root

    while (current !== root) {
      const candidate = path.join(current, "tsconfig.json")
      if (fs.existsSync(candidate)) {
        return candidate
      }
      current = path.dirname(current)
    }

    return undefined
  }
}
