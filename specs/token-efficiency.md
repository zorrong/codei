# Spec: Nâng cấp tiết kiệm token & hiệu năng

Trạng thái: Đã xong (P0 + P1 + P2) · Phạm vi: `packages/core`, `packages/cli` · Ngày: 2026-10-06

> Ghi chú: `benchmarks/queries.json`, `benchmarks/baseline.json`, `benchmarks/output/` bị gitignore
> nên baseline chỉ lưu local. Muốn commit baseline thì bỏ ignore hoặc chép số vào đây.
>
> Baseline 2026-10-06 (packages/core, heuristic-only, không LLM):
> retrieval-flow 286 tokens (0%/0%), traversal-cache 1631 (100%/100%),
> context-builder 286 (0%/0%) vs full dump 47415.
> Hit thấp ở 2 query là do chạy heuristic-only (NoopLLM, không có API key);
> với LLM thật, traverse dùng prompt rút gọn + top-30 candidate.
> Số token (giảm 97–99% vs full dump) mới là chỉ số chính của baseline này.

## 8. Sửa lỗi path Windows (ngoài spec, làm kèm)

- Thêm `toPosixPath` / `relativePosix` (`packages/core/src/storage/paths.ts`, export từ index).
- Mọi relative path trong index (FileScanner, IndexManager, FileSystemIndexStore,
  8 AstParser + TsMorphParser + TypeScriptAdapter) chuẩn hoá về forward slash.
- Sửa 4 test fail có sẵn (phase4 2, adapter-typescript 2). Full suite: 15 files, 133 tests, pass hết.
- Thêm `packages/cli/tests/mcp.test.ts` (4 test qua InMemoryTransport):
  list tools, query, status, update.

## 1. Mục tiêu

| Chỉ số | Hiện tại | Mục tiêu |
|---|---|---|
| Token context trung bình / query (benchmark) | baseline (đo trước khi sửa) | giảm ≥ 40% |
| Token LLM traverse / query (cache miss) | không giới hạn trên repo lớn | ≤ 2.000 |
| Context bị cắt giữa code | có thể xảy ra | 0 |
| Latency `/query` cache hit | đọc tree từ đĩa mỗi request | < 50 ms |
| Độ chính xác benchmark (file đúng có trong kết quả) | baseline | không giảm |

Ngoài phạm vi: vector DB, web dashboard, VS Code extension, đổi format index trên đĩa.

## 2. Đo lường (làm trước)

- `benchmarks/run-benchmark.mjs` ghi ra cho từng query: `estimatedTokens`, số LLM call, tổng token prompt traverse, có/không chứa file kỳ vọng.
- Chạy và lưu `benchmarks/baseline.json` trước khi sửa P0. Mọi PR sau so sánh với file này.

---

## 3. P0 — Giảm token

### P0-1. Lọc dependency theo tên được dùng

- File: `packages/core/src/retrieval/DependencyExpander.ts`
- Hiện tại: với mỗi file trong `symbol.internalRefs`, thêm **mọi** symbol exported của file đó.
- Thay đổi: chỉ thêm `depSym` nếu `depSym.title` xuất hiện như một từ (`\b<name>\b`) trong `fullSource` của ít nhất một symbol đã chọn.
- Giữ nguyên: chỉ 1 hop, chỉ exported, dedupe bằng `seen`.
- Chấp nhận:
  - File dep export `A, B, C`, symbol chọn chỉ dùng `A` → output chỉ có `A`.
  - Tên là substring (`User` vs `UserService`) không bị match nhầm.
- Test: `packages/core/tests/dependency-expander.test.ts`.

### P0-2. Cắt context theo khối, không cắt theo ký tự

- File: `packages/core/src/retrieval/ContextBuilder.ts`
- Hiện tại: `pruneToLimit` dùng `context.slice(0, maxChars)`.
- Thay đổi: build danh sách khối có thứ tự ưu tiên, cộng dần token, bỏ khối khi vượt `maxOutputTokens`:
  1. Symbol direct theo `relevanceScore` giảm dần (xem P2-14), cùng điểm thì giữ thứ tự hiện tại.
  2. Dependency signatures.
- Thứ tự bỏ: dependency trước, rồi symbol direct điểm thấp nhất.
- Nếu đã bỏ khối, thêm 1 dòng cuối: `// omitted: <n> symbols, <m> deps (token limit)`.
- Header file (`=== path ===`) chỉ in nếu còn ít nhất 1 symbol của file đó.
- Chấp nhận:
  - Output không bao giờ chứa nửa symbol.
  - `estimatedTokens` ≤ `maxOutputTokens` (trừ trường hợp 1 symbol đơn lẻ đã vượt → áp dụng P0-4).
- Test: `packages/core/tests/context-builder.test.ts`.

### P0-3. Giới hạn số candidate gửi LLM

- File: `packages/core/src/llm/TraversalReasoner.ts`, `packages/core/src/tree/TreeTraversal.ts`
- Hiện tại: `tryDirectSymbolTraversal` và `getAllFileCandidates` có thể đưa toàn bộ symbol/file vào prompt.
- Thay đổi: trong `selectNodes`, trước khi build prompt, nếu `candidates.length > MAX_LLM_CANDIDATES` (= 30) thì giữ top 30 theo `scoreCandidates`; candidate điểm 0 vẫn được dùng để lấp chỗ trống theo thứ tự gốc.
- Hằng số đặt trong file, không đưa vào config (`ponytail:` comment nếu cần chỉnh sau).
- Chấp nhận: prompt traverse có ≤ 30 dòng candidate với mọi kích thước repo.
- Test: thêm case vào `packages/core/tests/traversal-reasoner.test.ts` với 500 candidates, mock LLM ghi lại prompt, assert số dòng `[...]` ≤ 30.

### P0-4. Rút gọn symbol lớn

- File: `packages/core/src/retrieval/ContextBuilder.ts`
- Thay đổi: nếu `fullSource` của symbol direct > `MAX_SYMBOL_TOKENS` (= 400, ước lượng `length / 4`):
  - Nếu là `class`/`interface`: in `signature` + các dòng khai báo method/field (dòng có cấp thụt lề đầu tiên trong thân, bỏ body).
  - Ngược lại: in 400 token đầu, cắt tại ranh giới dòng, kèm `// ... <n> lines omitted (L<start>-L<end>)`.
- Luôn kèm `// <filePath>:L<startLine>-L<endLine>` để agent tự đọc nếu cần.
- Chấp nhận: class 500 dòng ra ≤ 400 token, vẫn đọc được danh sách method.
- Test: chung file `context-builder.test.ts`.

### P0-5. Rút gọn prompt traverse

- File: `packages/core/src/llm/TraversalReasoner.ts`
- Thay đổi prompt còn:
  ```
  Pick up to N <level>s relevant to the query (query may be non-English).
  Query: "<q>"
  <id> <title>: <summary>   (mỗi dòng 1 candidate)
  Reply JSON only: {"s":["id",...]}
  ```
- `maxTokens` của response: 200 → 100.
- `parseDecision` chấp nhận cả `s` và `selected` (tương thích ngược); bỏ `reasoning` khỏi yêu cầu, trả `reasoning: "llm"`.
- Summary candidate cắt ≤ 120 ký tự.
- Chấp nhận: phần prompt cố định ≤ 50 token; benchmark không giảm độ chính xác.

---

## 4. P1 — Hiệu năng

### P1-6. Giữ tree trong RAM ở HttpServer

- File: `packages/cli/src/server/HttpServer.ts`
- Thay đổi: field `tree` + `treeMtimeMs`. Mỗi `/query` chỉ `fs.stat` file tree; load lại khi mtime đổi. `/update` thành công → xoá cache tree.
- Chấp nhận: 2 query liên tiếp chỉ đọc file tree 1 lần.

### P1-7. Cache chỉ lưu nodeId

- File: `packages/core/src/retrieval/TraversalCache.ts`, `Retriever.ts`
- Thay đổi: entry lưu `{ fileIds: string[], symbolIds: string[], path: string[] }`. `Retriever` resolve lại từ `tree.nodes`; id không còn tồn tại → bỏ qua; nếu không còn symbol nào → coi như miss.
- `JSON.stringify` không pretty-print.
- Đọc file cache cũ (format có node đầy đủ): map sang id khi load.
- Chấp nhận: kích thước `traversal-cache.json` giảm ≥ 90% với cùng số entry.

### P1-8. TTL cache

- Default `ttlMs`: 1h → 7 ngày. Cache đã bị vô hiệu theo `tree:${builtAt}`.

### P1-9. Gộp nhánh trong Retriever

- File: `packages/core/src/retrieval/Retriever.ts`
- Thay đổi: lấy `{selectedFiles, selectedSymbols, path}` từ cache hoặc traversal, rồi dùng chung một đoạn expand + build + map kết quả. `reasoning` = `"cache"` hoặc `"traversal"`.
- Chấp nhận: không đổi hành vi; test hiện có vẫn pass.

### P1-10. Dọn map rate-limit

- File: `HttpServer.ts`
- Thay đổi: trong `checkRateLimit`, khi `rateLimit.size > 1000` thì xoá các entry có `resetAt <= now`.

---

## 5. P2 — Tính năng

### P2-11. MCP server (stdio)

- File mới: `packages/cli/src/commands/mcp.ts`, đăng ký trong `commands/index.ts`.
- Lệnh: `codei mcp [--cwd <path>]`.
- Dependency: `@modelcontextprotocol/sdk` (dependency duy nhất được thêm).
- Tools:
  | Tool | Input | Output |
  |---|---|---|
  | `codei_query` | `query: string`, `maxTokens?: number` (≤ 16000), `expandDeps?: boolean` | text context |
  | `codei_update` | — | `filesUpdated/New/Deleted` |
  | `codei_status` | — | status JSON |
- Dùng lại logic tree-in-RAM của P1-6 (tách hàm nhỏ dùng chung, không tạo class mới).
- `init` thêm tuỳ chọn ghi config MCP cho Claude Code / Cursor.
- Chấp nhận: Claude Code gọi `codei_query` trả context giống `codei query`.

### P2-12. Báo cáo token tiết kiệm

- `RetrievalResult` thêm `rawTokens` (tổng `fullSource` của tất cả symbol trong các file được chọn / 4) và `savedPct`.
- Trả ra trong `/query`, `--format json`, và dòng verbose `[codei] Tokens: ~X (saved Y%)`.

### P2-13. Cờ `compact`

- `RetrievalConfig.compact: boolean` (default `false`); CLI `--compact`; HTTP `compact`.
- Khi bật: bỏ dòng trống và dòng chỉ chứa comment (`//`, `#`, `/* */` một dòng) khỏi `fullSource`. Không đụng string literal.
- Chấp nhận: benchmark với `--compact` giảm token, độ chính xác không đổi.

### P2-14. relevanceScore thật

- `TraversalReasoner.selectNodes` trả thêm `scores: Record<id, number>` (chuẩn hoá 0–1 từ `scoreCandidates`; LLM chọn mà heuristic 0 → 0.5).
- `Retriever` gán vào `RetrievedSymbol.relevanceScore`; `ContextBuilder` dùng cho P0-2.

### P2-15. Vô hiệu cache theo file đổi

- Sau `update`, với mỗi file đổi: dùng `SymbolDependencyGraph.getImpactedByFileChange` + chính file đó, xoá entry cache có chứa các id này.
- Cần đổi cache key: không còn xoá toàn bộ theo `builtAt` mà theo id (phụ thuộc P1-7).
- Chấp nhận: đổi 1 file → chỉ entry liên quan bị xoá.

---

## 6. Thứ tự triển khai

| Bước | Hạng mục | Phụ thuộc |
|---|---|---|
| 0 | Đo baseline (mục 2) | — |
| 1 | P0-1, P0-3 | — |
| 2 | P2-14, P0-2, P0-4 | P2-14 trước P0-2 |
| 3 | P0-5 | chạy lại benchmark |
| 4 | P1-9, P1-7, P1-8 | P1-9 trước P1-7 |
| 5 | P1-6, P1-10 | — |
| 6 | P2-12, P2-13 | — |
| 7 | P2-11 (MCP) | P1-6 |
| 8 | P2-15 | P1-7 |

Mỗi bước: 1 PR, `pnpm test` pass, benchmark không kém baseline, thêm changeset.

## 7. Rủi ro

- P0-1 lọc theo tên có thể bỏ sót dep dùng qua alias (`import { A as B }`) → chấp nhận; ghi `ponytail:` nếu cần resolve alias sau.
- P0-5 prompt ngắn có thể giảm chất lượng với model nhỏ → kiểm bằng benchmark, rollback riêng được.
- P1-7 đổi format cache → giữ đường đọc format cũ.
