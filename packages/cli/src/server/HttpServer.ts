/**
 * HttpServer — local HTTP server để IDE extensions gọi vào.
 * Chạy tại http://localhost:3131
 *
 * Endpoints:
 *   POST /query         — query index, trả về context
 *   GET  /status        — index health check
 *   POST /update        — trigger incremental update
 *   GET  /health        — server health
 */

import * as http from "http"
import * as path from "path"
import { FileSystemIndexStore, Retriever, TraversalCache } from "pnftrading_codei-core"
import type { LLMClient } from "pnftrading_codei-core"
import type { CodeiConfig } from "../config.js"
import { createIndexManager } from "../createServices.js"

export interface HttpServerOptions {
  port?: number
  host?: string
  projectRoot: string
  config: CodeiConfig
  llmClient: LLMClient
}

export class HttpServer {
  private readonly port: number
  private readonly host: string
  private readonly projectRoot: string
  private readonly config: CodeiConfig
  private readonly llmClient: LLMClient
  private server: http.Server | null = null
  private readonly traversalCache: TraversalCache
  private readonly serverApiKey: string | undefined
  private readonly corsOrigin: string
  private readonly maxBodyBytes: number
  private readonly rateLimitPerMinute: number
  private readonly rateLimit: Map<string, { resetAt: number; count: number }> = new Map()

  constructor(options: HttpServerOptions) {
    this.port = options.port ?? 3131
    this.host = options.host ?? "127.0.0.1"
    this.projectRoot = options.projectRoot
    this.config = options.config
    this.llmClient = options.llmClient
    this.traversalCache = new TraversalCache({
      persistencePath: path.join(this.projectRoot, this.config.indexDir, "traversal-cache.json"),
    })
    this.serverApiKey = options.config.serverApiKey
    this.corsOrigin = options.config.serverCorsOrigin ?? "*"
    this.maxBodyBytes = options.config.serverMaxBodyBytes ?? 1024 * 1024
    this.rateLimitPerMinute = options.config.serverRateLimitPerMinute ?? 120
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        const requestId = this.randomId()
        const startedAt = Date.now()

        res.setHeader("Access-Control-Allow-Origin", this.corsOrigin)
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Codei-Api-Key")
        res.setHeader("X-Request-Id", requestId)

        if (req.method === "OPTIONS") {
          res.writeHead(204)
          res.end()
          return
        }

        try {
          await this.handleRequest(req, res, requestId)
        } catch (err) {
          this.sendJson(res, 500, { error: (err as Error).message, code: "INTERNAL_ERROR", requestId })
        }

        const durationMs = Date.now() - startedAt
        this.log({
          level: "info",
          message: "http_request",
          requestId,
          method: req.method ?? "",
          path: req.url ?? "",
          statusCode: res.statusCode,
          durationMs,
        })
      })

      this.server.on("error", reject)
      this.server.requestTimeout = 30_000
      this.server.headersTimeout = 35_000
      this.server.keepAliveTimeout = 5_000
      this.server.listen(this.port, this.host, () => resolve())
    })
  }

  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) return resolve()
      this.server.close((err) => (err ? reject(err) : resolve()))
    })
  }

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    requestId: string
  ): Promise<void> {
    const url = new URL(req.url ?? "/", `http://localhost:${this.port}`)

    // GET /health
    if (req.method === "GET" && url.pathname === "/health") {
      this.sendJson(res, 200, { status: "ok", port: this.port })
      return
    }

    if (!this.checkRateLimit(req)) {
      this.sendJson(res, 429, { error: "Too many requests", code: "RATE_LIMITED", requestId })
      return
    }

    if (!this.checkAuth(req)) {
      res.setHeader("WWW-Authenticate", "Bearer")
      this.sendJson(res, 401, { error: "Unauthorized", code: "UNAUTHORIZED", requestId })
      return
    }

    // GET /status
    if (req.method === "GET" && url.pathname === "/status") {
      const manager = await createIndexManager(this.projectRoot, this.config, this.llmClient)
      const status = await manager.status()
      this.sendJson(res, 200, status)
      return
    }

    // POST /query
    if (req.method === "POST" && url.pathname === "/query") {
      const parsed = await this.readJsonBody(req)
      if (!parsed.ok) {
        this.sendJson(res, 400, { error: parsed.error, code: "BAD_REQUEST", requestId })
        return
      }

      const { query, maxTokens, expandDeps, maxSymbols } = parsed.value as {
        query: string
        maxTokens?: number
        expandDeps?: boolean
        maxSymbols?: number
      }

      if (!query || typeof query !== "string") {
        this.sendJson(res, 400, { error: "query field is required", code: "BAD_REQUEST", requestId })
        return
      }

      const store = new FileSystemIndexStore(this.projectRoot, this.config.indexDir)
      const tree = await store.loadTree()

      if (!tree) {
        this.sendJson(res, 404, {
          error: "No index found. Run: codei index <path>",
          code: "NO_INDEX",
          requestId,
        })
        return
      }

      this.traversalCache.setCacheKey(`tree:${tree.builtAt}`)

      const retriever = new Retriever({
        llmClient: this.llmClient,
        cache: this.traversalCache,
        config: {
          maxOutputTokens: maxTokens ?? 4000,
          expandDeps: expandDeps ?? true,
          maxSymbols: maxSymbols ?? 10,
          depSymbolsIncludeBody: false,
        },
      })

      const result = await retriever.retrieve(tree, { query })

      this.sendJson(res, 200, {
        query: result.query,
        context: result.formattedContext,
        estimatedTokens: result.estimatedTokens,
        traversalPath: result.traversalPath,
        files: result.files.map((f) => ({
          path: f.node.filePath,
          symbols: f.symbols.map((s) => s.node.title),
        })),
      })
      return
    }

    // POST /update
    if (req.method === "POST" && url.pathname === "/update") {
      const manager = await createIndexManager(this.projectRoot, this.config, this.llmClient)
      const result = await manager.update()
      this.sendJson(res, 200, {
        upToDate: result.upToDate,
        filesUpdated: result.filesUpdated,
        filesNew: result.filesNew,
        filesDeleted: result.filesDeleted,
        durationMs: result.durationMs,
      })
      return
    }

    this.sendJson(res, 404, { error: `Unknown endpoint: ${req.method} ${url.pathname}`, code: "NOT_FOUND", requestId })
  }

  private sendJson(
    res: http.ServerResponse,
    status: number,
    data: unknown
  ): void {
    const body = JSON.stringify(data)
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    })
    res.end(body)
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      let total = 0
      req.on("data", (chunk: Buffer) => {
        total += chunk.length
        if (total > this.maxBodyBytes) {
          reject(new Error("Request body too large"))
          req.destroy()
          return
        }
        chunks.push(chunk)
      })
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")))
      req.on("error", reject)
    })
  }

  private async readJsonBody(req: http.IncomingMessage): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
    try {
      const body = await this.readBody(req)
      if (!body) return { ok: true, value: {} }
      return { ok: true, value: JSON.parse(body) as unknown }
    } catch (err) {
      const msg = (err as Error).message
      if (msg === "Request body too large") return { ok: false, error: msg }
      return { ok: false, error: "Invalid JSON body" }
    }
  }

  private checkAuth(req: http.IncomingMessage): boolean {
    if (!this.serverApiKey) return true
    const headerKey = (req.headers["x-codei-api-key"] as string | undefined) ?? ""
    if (headerKey && headerKey === this.serverApiKey) return true
    const auth = (req.headers["authorization"] as string | undefined) ?? ""
    if (auth.startsWith("Bearer ") && auth.slice("Bearer ".length) === this.serverApiKey) return true
    return false
  }

  private checkRateLimit(req: http.IncomingMessage): boolean {
    const ip = this.getClientIp(req)
    const now = Date.now()
    const windowMs = 60_000
    const entry = this.rateLimit.get(ip)
    if (!entry || entry.resetAt <= now) {
      this.rateLimit.set(ip, { resetAt: now + windowMs, count: 1 })
      return true
    }
    entry.count++
    this.rateLimit.set(ip, entry)
    return entry.count <= this.rateLimitPerMinute
  }

  private getClientIp(req: http.IncomingMessage): string {
    const fromSocket = req.socket.remoteAddress ?? "unknown"
    return fromSocket
  }

  private randomId(): string {
    return Math.random().toString(16).slice(2) + Date.now().toString(16)
  }

  private log(data: Record<string, unknown>): void {
    if (this.config.verbose) {
      process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), ...data }) + "\n")
    }
  }
}
