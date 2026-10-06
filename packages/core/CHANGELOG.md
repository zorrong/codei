# pnftrading_codei-core

## 0.2.0

### Minor Changes

- e8f8be1: Vòng 3 (tiết kiệm token sâu hơn trong ContextBuilder + MCP):

  - Dedup symbol lồng nhau: method nằm trong class đã chọn không in 2 lần
    (trừ khi class bị truncate, method vẫn giữ)
  - Render theo hạng điểm: top-3 full body, còn lại signature + vị trí dòng
  - Cắt theo khoảng cách điểm: bỏ symbol <30% max score (budget là trần)
  - MCP session dedup: symbol đã gửi chỉ còn dòng tham chiếu,
    `fresh: true` để gửi lại, `codei_update` xoá trí nhớ session
  - Bỏ dòng summary cấp file khỏi context

- 27db227: Vòng 2 (theo gợi ý còn thiếu):

  - Heuristic summary kèm doc comment đầu tiên của file
  - Direct file mode: query trùng path file trả thẳng, không gọi LLM
  - Telemetry local: query-log.jsonl + lệnh `codei stats`
  - `codei status --fail-if-stale` (exit 2) cho CI
  - Config `ignore` trong .codei.json để loại thư mục khỏi index

- 84fd4d8: Token efficiency + performance upgrade (specs/token-efficiency.md):

  - DependencyExpander chỉ giữ dep có tên được dùng trong source đã chọn
  - ContextBuilder cắt context theo khối (không cắt giữa code), rút gọn symbol lớn >400 tokens
  - TraversalReasoner giới hạn 30 candidates/LLM call, prompt rút gọn, trả relevance scores 0-1
  - TraversalCache chỉ persist nodeId (giảm ~90% file cache), TTL 7 ngày, vô hiệu chọn lọc theo file đổi
  - HttpServer/MCP giữ tree trong RAM, dọn rate-limit map
  - RetrievalResult thêm rawTokens/savedPct; flag --compact; query/HTTP/MCP hỗ trợ compact
  - Lệnh mới `codei mcp` (stdio) với tools codei_query/codei_update/codei_status; `codei init --mcp` in cấu hình MCP
  - UpdateResult thêm updatedFiles để vô hiệu cache chọn lọc
  - Chuẩn hoá relative path về POSIX (sửa 4 test fail sẵn trên Windows)
  - Test MCP qua InMemoryTransport (list tools, query, status, update)

### Patch Changes

- 9147d68: Accuracy harness: retrieval-accuracy.test.ts chạy offline trong CI,
  khóa recall (file + symbol + render) sau các vòng cắt token
