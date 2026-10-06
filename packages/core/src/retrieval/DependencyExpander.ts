/**
 * DependencyExpander — mở rộng context bằng cách include 1-hop dependencies.
 * Khi symbol A depend on symbol B, include signature của B (không có body).
 */

import type { IndexTree, SymbolNode, FileNode } from "../types/TreeNode.js"

export interface ExpandedDep {
  symbol: SymbolNode
  /** File chứa symbol này */
  fileNode: FileNode
  /** Signature only — không có body */
  signatureOnly: string
}

export class DependencyExpander {
  /**
   * Tìm 1-hop dependencies của một danh sách symbols.
   * Chỉ include deps nằm trong project (internal), không include external packages.
   * Không include body của dep symbols — chỉ signature.
   */
  expand(
    tree: IndexTree,
    selectedSymbols: SymbolNode[],
    selectedSymbolIds: Set<string>
  ): ExpandedDep[] {
    const deps: ExpandedDep[] = []
    const seen = new Set<string>()
    const combinedSource = selectedSymbols.map((s) => s.fullSource).join("\n")

    for (const symbol of selectedSymbols) {
      for (const depFilePath of symbol.internalRefs) {
        // Tìm tất cả symbols trong dep file
        const depFileNodeId = `file:${depFilePath}`
        const depFileNode = tree.nodes[depFileNodeId]
        if (depFileNode?.level !== "file") continue

        for (const depSymId of depFileNode.children) {
          // Không include nếu đã trong selected set hoặc đã thêm rồi
          if (selectedSymbolIds.has(depSymId) || seen.has(depSymId)) continue

          const depSym = tree.nodes[depSymId]
          if (depSym?.level !== "symbol") continue
          if (!depSym.isExported) continue  // chỉ include exported symbols
          // P0-1: chỉ giữ dep có tên được dùng trong source đã chọn
          if (!this.isReferenced(depSym.title, combinedSource)) continue

          seen.add(depSymId)
          deps.push({
            symbol: depSym,
            fileNode: depFileNode,
            signatureOnly: depSym.signature,
          })
        }
      }
    }

    return deps
  }

  private isReferenced(name: string, source: string): boolean {
    if (!name) return false
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    try {
      return new RegExp(`\\b${escaped}\\b`).test(source)
    } catch {
      return source.includes(name)
    }
  }
}
