import { describe, expect, it, vi } from "vitest"
import { TraversalCache } from "@pnftrading/codei-core"
import { retrieveWithVerboseCacheStatus } from "../src/commands/query.js"

describe("retrieveWithVerboseCacheStatus", () => {
  it("reports miss when retrieve populates cache for the first time", async () => {
    const cache = new TraversalCache()
    const traversalResult = {
      selectedFiles: [],
      selectedSymbols: [],
      path: ["modules: [mod:packages/cli]"],
    }
    const retrievalResult = {
      query: "drawing storage save",
      files: [],
      formattedContext: "context",
      estimatedTokens: 123,
      traversalPath: traversalResult.path,
    }
    const retriever = {
      retrieve: vi.fn(async (_tree, query) => {
        cache.set(query.query, traversalResult)
        return retrievalResult
      }),
    }

    const outcome = await retrieveWithVerboseCacheStatus(
      retriever,
      cache,
      {} as never,
      {
        query: "drawing storage save",
        maxOutputTokens: 400,
        expandDeps: true,
      }
    )

    expect(outcome.cacheStatus).toBe("miss")
    expect(outcome.result).toEqual(retrievalResult)
  })

  it("reports exact when the same query is already cached", async () => {
    const cache = new TraversalCache()
    const traversalResult = {
      selectedFiles: [],
      selectedSymbols: [],
      path: ["symbols: [sym:packages/cli/src/commands/query.ts:registerQueryCommand]"],
    }
    cache.set("drawing storage save", traversalResult)

    const retriever = {
      retrieve: vi.fn(async () => ({
        query: "drawing storage save",
        files: [],
        formattedContext: "context",
        estimatedTokens: 42,
        traversalPath: traversalResult.path,
      })),
    }

    const outcome = await retrieveWithVerboseCacheStatus(
      retriever,
      cache,
      {} as never,
      {
        query: "drawing storage save",
        maxOutputTokens: 400,
        expandDeps: true,
      }
    )

    expect(outcome.cacheStatus).toBe("exact")
  })

  it("reports similar when a highly overlapping query is cached", async () => {
    const cache = new TraversalCache()
    const traversalResult = {
      selectedFiles: [],
      selectedSymbols: [],
      path: ["modules: [mod:apps/web/src/features/drawing/services]"],
    }
    cache.set("drawing storage save indexeddb cloud", traversalResult)

    const retriever = {
      retrieve: vi.fn(async () => ({
        query: "drawing storage save indexeddb cache cloud",
        files: [],
        formattedContext: "context",
        estimatedTokens: 88,
        traversalPath: traversalResult.path,
      })),
    }

    const outcome = await retrieveWithVerboseCacheStatus(
      retriever,
      cache,
      {} as never,
      {
        query: "drawing storage save indexeddb cache cloud",
        maxOutputTokens: 400,
        expandDeps: true,
      }
    )

    expect(outcome.cacheStatus).toBe("similar")
  })
})
