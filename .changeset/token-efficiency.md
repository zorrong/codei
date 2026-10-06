---
"pnftrading_codei-core": minor
"pnftrading_codei": minor
---

Token efficiency + performance upgrade (specs/token-efficiency.md):

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
