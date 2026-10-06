import type { IndexTree, SymbolNode, FileNode } from "../types/TreeNode.js"

export class SymbolDependencyGraph {
  private readonly symbolToFiles: Map<string, Set<string>> = new Map()
  private readonly fileToSymbols: Map<string, Set<string>> = new Map()

  constructor(private readonly tree: IndexTree) {
    for (const node of Object.values(tree.nodes)) {
      if (node?.level !== "symbol") continue
      const sym = node as SymbolNode
      const refs = new Set(sym.internalRefs ?? [])
      this.symbolToFiles.set(sym.nodeId, refs)
      for (const filePath of refs) {
        const existing = this.fileToSymbols.get(filePath) ?? new Set<string>()
        existing.add(sym.nodeId)
        this.fileToSymbols.set(filePath, existing)
      }
    }
  }

  getReferencedFiles(symbolId: string): string[] {
    return Array.from(this.symbolToFiles.get(symbolId) ?? [])
  }

  getReferencingSymbols(filePath: string): SymbolNode[] {
    const ids = this.fileToSymbols.get(filePath) ?? new Set<string>()
    const out: SymbolNode[] = []
    for (const id of ids) {
      const node = this.tree.nodes[id]
      if (node?.level === "symbol") out.push(node as SymbolNode)
    }
    return out
  }

  getImpactedByFileChange(filePath: string): SymbolNode[] {
    return this.getReferencingSymbols(filePath)
  }

  /**
   * P2-15: tập nodeId cần vô hiệu cache khi các file đổi.
   * Gồm file nodeIds, symbols trong file đổi, và symbols tham chiếu tới file đổi.
   */
  getInvalidationIds(changedFiles: string[]): Set<string> {
    const ids = new Set<string>()
    for (const filePath of changedFiles) {
      ids.add(`file:${filePath}`)
      const fileNode = this.tree.nodes[`file:${filePath}`]
      if (fileNode?.level === "file") {
        for (const childId of fileNode.children) ids.add(childId)
      }
      for (const sym of this.getImpactedByFileChange(filePath)) {
        ids.add(sym.nodeId)
      }
    }
    return ids
  }

  getCircularFileDeps(): string[][] {
    const visited = new Set<string>()
    const stack = new Set<string>()
    const cycles: string[][] = []

    const dfs = (filePath: string, path: string[]) => {
      visited.add(filePath)
      stack.add(filePath)
      path.push(filePath)

      const node = this.tree.nodes[`file:${filePath}`]
      const deps = node?.level === "file" ? (node as FileNode).internalDeps : []
      for (const dep of deps) {
        if (!visited.has(dep)) {
          dfs(dep, path)
        } else if (stack.has(dep)) {
          const start = path.indexOf(dep)
          if (start >= 0) cycles.push(path.slice(start))
        }
      }

      path.pop()
      stack.delete(filePath)
    }

    for (const node of Object.values(this.tree.nodes)) {
      if (node?.level !== "file") continue
      const filePath = (node as FileNode).filePath
      if (!visited.has(filePath)) dfs(filePath, [])
    }

    return cycles
  }
}

