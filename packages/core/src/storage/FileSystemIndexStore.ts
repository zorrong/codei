/**
 * FileSystemIndexStore — lưu index dưới dạng JSON files trên disk.
 * Default implementation. Atomic writes để tránh corrupted index.
 */

import type { IndexTree, FileNode } from "../types/TreeNode.js"
import type {
  IndexStore,
  IndexStoreMeta,
  StaleFile,
} from "../types/IndexStore.js"
import type { SummaryCache } from "../llm/SummaryGenerator.js"
import * as fs from "fs/promises"
import * as fsSync from "fs"
import * as path from "path"
import { execSync } from "child_process"

export class FileSystemIndexStore implements IndexStore {
  private readonly indexDir: string
  private readonly treePath: string
  private readonly metaPath: string
  private readonly symbolsDir: string
  private readonly summariesPath: string

  constructor(projectRoot: string, indexDirName = ".index") {
    this.indexDir = path.join(projectRoot, indexDirName)
    this.treePath = path.join(this.indexDir, "tree.json")
    this.metaPath = path.join(this.indexDir, "meta.json")
    this.symbolsDir = path.join(this.indexDir, "symbols")
    this.summariesPath = path.join(this.indexDir, "summaries.json")
  }

  async exists(): Promise<boolean> {
    return fsSync.existsSync(this.treePath)
  }

  async loadTree(): Promise<IndexTree | null> {
    try {
      const content = await fs.readFile(this.treePath, "utf-8")
      return JSON.parse(content) as IndexTree
    } catch {
      return null
    }
  }

  async saveTree(tree: IndexTree): Promise<void> {
    await this.ensureDirs()
    const tmp = this.treePath + ".tmp"
    await fs.writeFile(tmp, JSON.stringify(tree, null, 2), "utf-8")
    await fs.rename(tmp, this.treePath)
  }

  async loadMeta(): Promise<IndexStoreMeta | null> {
    try {
      const content = await fs.readFile(this.metaPath, "utf-8")
      return JSON.parse(content) as IndexStoreMeta
    } catch {
      return null
    }
  }

  async saveMeta(meta: IndexStoreMeta): Promise<void> {
    await this.ensureDirs()
    const tmp = this.metaPath + ".tmp"
    await fs.writeFile(tmp, JSON.stringify(meta, null, 2), "utf-8")
    await fs.rename(tmp, this.metaPath)
  }

  async loadFileNode(relativePath: string): Promise<FileNode | null> {
    try {
      const filePath = this.symbolFilePath(relativePath)
      const content = await fs.readFile(filePath, "utf-8")
      return JSON.parse(content) as FileNode
    } catch {
      return null
    }
  }

  async saveFileNode(node: FileNode): Promise<void> {
    await this.ensureDirs()
    const filePath = this.symbolFilePath(node.filePath)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, JSON.stringify(node, null, 2), "utf-8")
  }

  async loadSummaryCache(): Promise<SummaryCache> {
    try {
      const content = await fs.readFile(this.summariesPath, "utf-8")
      return JSON.parse(content) as SummaryCache
    } catch {
      return {}
    }
  }

  async saveSummaryCache(cache: SummaryCache): Promise<void> {
    await this.ensureDirs()
    const tmp = this.summariesPath + ".tmp"
    await fs.writeFile(tmp, JSON.stringify(cache, null, 2), "utf-8")
    await fs.rename(tmp, this.summariesPath)
  }

  async deleteFileNode(relativePath: string): Promise<void> {
    try {
      const filePath = this.symbolFilePath(relativePath)
      await fs.unlink(filePath)
    } catch {
      // File doesn't exist — that's fine
    }
  }

  async detectStaleFiles(projectRoot: string): Promise<StaleFile[]> {
    const meta = await this.loadMeta()
    if (!meta) return []

    const stale: StaleFile[] = []
    const indexedFiles = new Set(Object.keys(meta.gitHashMap))

    // Get current git hashes for all tracked files
    const currentHashes = this.getGitHashes(projectRoot)

    // Check modified or deleted
    for (const [relPath, indexedHash] of Object.entries(meta.gitHashMap)) {
      const currentHash = currentHashes.get(relPath)
      if (currentHash === undefined) {
        stale.push({ filePath: relPath, reason: "deleted", indexedHash })
      } else if (currentHash !== indexedHash) {
        stale.push({
          filePath: relPath,
          reason: "modified",
          currentHash,
          indexedHash,
        })
      }
    }

    // Check new files (in git but not indexed)
    for (const [relPath, hash] of currentHashes.entries()) {
      if (!indexedFiles.has(relPath) && relPath.match(/\.(ts|tsx)$/)) {
        stale.push({ filePath: relPath, reason: "new", currentHash: hash })
      }
    }

    return stale
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async ensureDirs(): Promise<void> {
    await fs.mkdir(this.indexDir, { recursive: true })
    await fs.mkdir(this.symbolsDir, { recursive: true })
  }

  /** Convert relative file path thành path trong symbols cache dir */
  private symbolFilePath(relativePath: string): string {
    // Thay path separators bằng __ để tránh nested dirs phức tạp
    const key = relativePath.replace(/[\\/]/g, "__")
    return path.join(this.symbolsDir, `${key}.json`)
  }

  /** Lấy git hashes của tất cả tracked files */
  private getGitHashes(projectRoot: string): Map<string, string> {
    const result = new Map<string, string>()
    try {
      const output = execSync("git ls-files -s", {
        cwd: projectRoot,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      })
      for (const line of output.split("\n")) {
        const parts = line.trim().split(/\s+/)
        if (parts.length >= 4) {
          const hash = parts[1] ?? ""
          const filePath = parts.slice(3).join(" ")
          if (hash && filePath) result.set(filePath, hash)
        }
      }
    } catch {
      // Not a git repo or git not available — return empty
    }
    return result
  }

  /** Lấy git hash của một file cụ thể */
  static getFileGitHash(filePath: string, projectRoot: string): string {
    try {
      const relPath = path.relative(projectRoot, filePath)
      const hash = execSync(`git hash-object "${relPath}"`, {
        cwd: projectRoot,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim()
      return hash
    } catch {
      // Fallback: dùng mtime
      try {
        const stat = fsSync.statSync(filePath)
        return `mtime:${stat.mtimeMs}`
      } catch {
        return "unknown"
      }
    }
  }
}
