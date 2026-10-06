import { describe, expect, it } from "vitest"
import { TraversalReasoner } from "../src/llm/TraversalReasoner.js"
import { TreeTraversal } from "../src/tree/TreeTraversal.js"
import type { LLMClient, LLMRequest, LLMResponse } from "../src/types/LLMClient.js"
import type { IndexTree, FileNode, ModuleNode, ProjectNode, SymbolNode } from "../src/types/TreeNode.js"

class NoopLLMClient implements LLMClient {
  async complete(_request: LLMRequest): Promise<LLMResponse> {
    throw new Error("LLM disabled")
  }
}

describe("TraversalReasoner heuristic ranking", () => {
  const reasoner = new TraversalReasoner(new NoopLLMClient())

  it("prioritizes PascalCase symbol names from the query", async () => {
    const decision = await reasoner.selectNodes(
      "ChartcraftPriceScale BoxSizeMethod CHARTCRAFT PriceScale",
      [
        {
          nodeId: "sym:packages/core/src/engine/PriceScale.ts:ChartcraftPriceScale",
          title: "ChartcraftPriceScale (class)",
          summary: "Variable box-size price scale for chartcraft method",
        },
        {
          nodeId: "sym:test_adapter.ts:test",
          title: "test (function)",
          summary: "Adapter smoke test helper",
        },
      ],
      "symbol",
      2
    )

    expect(decision.selectedIds[0]).toBe("sym:packages/core/src/engine/PriceScale.ts:ChartcraftPriceScale")
  })

  it("returns no fallback candidates when nothing matches the query", async () => {
    const decision = await reasoner.selectNodes(
      "nonexistent totally unrelated identifier",
      [
        {
          nodeId: "mod:apps/web",
          title: "web",
          summary: "Frontend application",
        },
        {
          nodeId: "mod:apps/landing",
          title: "landing",
          summary: "Marketing pages",
        },
      ],
      "module",
      2
    )

    expect(decision.selectedIds).toEqual([])
  })
})

describe("TreeTraversal symbol-oriented fallback", () => {
  it("uses direct symbol traversal for identifier-focused queries", async () => {
    const root: ProjectNode = {
      nodeId: "project:demo",
      title: "demo",
      level: "project",
      shortSummary: "Demo project",
      children: ["mod:apps/web", "mod:packages/core/src/engine"],
      rootPath: "/demo",
      primaryLanguage: "typescript",
    }

    const webModule: ModuleNode = {
      nodeId: "mod:apps/web",
      title: "web",
      level: "module",
      shortSummary: "Frontend app",
      children: ["file:apps/web/src/App.tsx"],
      parentId: root.nodeId,
      dirPath: "apps/web",
    }

    const engineModule: ModuleNode = {
      nodeId: "mod:packages/core/src/engine",
      title: "engine",
      level: "module",
      shortSummary: "Core chart engine internals",
      children: ["file:packages/core/src/engine/PriceScale.ts"],
      parentId: root.nodeId,
      dirPath: "packages/core/src/engine",
    }

    const appFile: FileNode = {
      nodeId: "file:apps/web/src/App.tsx",
      title: "App.tsx",
      level: "file",
      shortSummary: "Main application component",
      children: ["sym:apps/web/src/App.tsx:App"],
      parentId: webModule.nodeId,
      filePath: "apps/web/src/App.tsx",
      gitHash: "a",
      indexedAt: 1,
      exports: ["App"],
      internalDeps: [],
      externalDeps: ["react"],
    }

    const priceScaleFile: FileNode = {
      nodeId: "file:packages/core/src/engine/PriceScale.ts",
      title: "PriceScale.ts",
      level: "file",
      shortSummary: "Contains FixedPriceScale and ChartcraftPriceScale implementations",
      children: ["sym:packages/core/src/engine/PriceScale.ts:ChartcraftPriceScale"],
      parentId: engineModule.nodeId,
      filePath: "packages/core/src/engine/PriceScale.ts",
      gitHash: "b",
      indexedAt: 1,
      exports: ["ChartcraftPriceScale", "createPriceScale"],
      internalDeps: [],
      externalDeps: [],
    }

    const appSymbol: SymbolNode = {
      nodeId: "sym:apps/web/src/App.tsx:App",
      title: "App",
      level: "symbol",
      shortSummary: "Application shell",
      children: [],
      parentId: appFile.nodeId,
      filePath: appFile.filePath,
      signature: "function App()",
      fullSource: "function App() { return null }",
      startLine: 1,
      endLine: 1,
      kind: "function",
      isExported: true,
      internalRefs: [],
    }

    const chartcraftSymbol: SymbolNode = {
      nodeId: "sym:packages/core/src/engine/PriceScale.ts:ChartcraftPriceScale",
      title: "ChartcraftPriceScale",
      level: "symbol",
      shortSummary: "Variable box-size price scale for chartcraft charts",
      children: [],
      parentId: priceScaleFile.nodeId,
      filePath: priceScaleFile.filePath,
      signature: "class ChartcraftPriceScale implements IPriceScale",
      fullSource: "class ChartcraftPriceScale implements IPriceScale {}",
      startLine: 1,
      endLine: 20,
      kind: "class",
      isExported: true,
      internalRefs: [],
    }

    const tree: IndexTree = {
      root,
      builtAt: 1,
      version: "1",
      nodes: {
        [root.nodeId]: root,
        [webModule.nodeId]: webModule,
        [engineModule.nodeId]: engineModule,
        [appFile.nodeId]: appFile,
        [priceScaleFile.nodeId]: priceScaleFile,
        [appSymbol.nodeId]: appSymbol,
        [chartcraftSymbol.nodeId]: chartcraftSymbol,
      },
    }

    const traversal = new TreeTraversal({
      llmClient: new NoopLLMClient(),
      maxModules: 3,
      maxFiles: 3,
      maxSymbols: 3,
    })

    const result = await traversal.traverse(
      tree,
      "ChartcraftPriceScale BoxSizeMethod CHARTCRAFT PriceScale"
    )

    expect(result.path[0]).toContain("direct-symbols:")
    expect(result.selectedFiles.map((file) => file.filePath)).toContain("packages/core/src/engine/PriceScale.ts")
    expect(result.selectedSymbols.map((symbol) => symbol.title)).toContain("ChartcraftPriceScale")
  })

  it("uses direct file traversal when the query is a file path (mục 2)", async () => {
    const root: ProjectNode = {
      nodeId: "project:demo",
      title: "demo",
      level: "project",
      shortSummary: "Demo project",
      children: ["file:src/a.ts", "file:src/b.ts"],
      rootPath: "/demo",
      primaryLanguage: "typescript",
    }
    const mkFile = (name: string, sym: string): FileNode => ({
      nodeId: `file:src/${name}`,
      title: name,
      level: "file",
      shortSummary: `${name} file`,
      children: [`sym:src/${name}:${sym}`],
      parentId: root.nodeId,
      filePath: `src/${name}`,
      gitHash: "x",
      indexedAt: 1,
      exports: [sym],
      internalDeps: [],
      externalDeps: [],
    })
    const mkSym = (file: string, name: string): SymbolNode => ({
      nodeId: `sym:src/${file}:${name}`,
      title: name,
      level: "symbol",
      shortSummary: `${name} symbol`,
      children: [],
      parentId: `file:src/${file}`,
      filePath: `src/${file}`,
      signature: `class ${name}`,
      fullSource: `class ${name} {}`,
      startLine: 1,
      endLine: 1,
      kind: "class",
      isExported: true,
      internalRefs: [],
    })
    const tree: IndexTree = {
      root,
      builtAt: 1,
      version: "1",
      nodes: {
        [root.nodeId]: root,
        "file:src/a.ts": mkFile("a.ts", "A"),
        "file:src/b.ts": mkFile("b.ts", "B"),
        "sym:src/a.ts:A": mkSym("a.ts", "A"),
        "sym:src/b.ts:B": mkSym("b.ts", "B"),
      },
    }

    const traversal = new TreeTraversal({ llmClient: new NoopLLMClient() })

    // Path đầy đủ — không cần LLM
    const full = await traversal.traverse(tree, "src/a.ts")
    expect(full.path[0]).toContain("direct-file:")
    expect(full.selectedFiles.map((f) => f.filePath)).toEqual(["src/a.ts"])
    expect(full.symbolScores?.["sym:src/a.ts:A"]).toBe(1)

    // Basename duy nhất
    const base = await traversal.traverse(tree, "b.ts")
    expect(base.selectedFiles.map((f) => f.filePath)).toEqual(["src/b.ts"])

    // Query thường không phải path → đi nhánh cũ
    const normal = await traversal.traverse(tree, "unrelated words here")
    expect(normal.path[0]).not.toContain("direct-file:")
  })
})
