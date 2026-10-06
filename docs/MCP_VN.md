# MCP Server (Tiếng Việt)

`codei mcp` mở index dưới dạng [Model Context Protocol](https://modelcontextprotocol.io/) server qua stdio. Agent (Claude Code, Cursor, Windsurf) gọi thẳng như một tool thay vì chạy shell lệnh CLI — tốn ít token hơn, ít lỗi parse hơn.

```bash
codei mcp --cwd /path/to/project
```

In config sẵn để paste vào client:

```bash
codei init --mcp
# { "mcpServers": { "codei": { "command": "codei", "args": ["mcp", "--cwd", "/abs/path"] } } }
```

## Tools

### `codei_query`

Hỏi index, trả về code context đã format dưới dạng text.

| Tham số | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `query` | string | bắt buộc | Câu hỏi về codebase |
| `maxTokens` | number | `4000` | Token tối đa cho context (100–16000) |
| `expandDeps` | boolean | `true` | Có kèm signature của dependency không |
| `compact` | boolean | `false` | Bỏ dòng trống + dòng chỉ có comment |
| `fresh` | boolean | `false` | Bỏ qua dedup session, gửi lại full source |

Cuối text có dòng footer:

```
// tokens: ~1943 (saved 75%) | files: src/a.ts, src/b.ts
```

`saved` = % tiết kiệm so với dump toàn bộ các file được chọn.

Cách giảm token mỗi response:

- Top-3 symbol theo điểm render full source, từ hạng 4 chỉ in signature.
- Symbol điểm dưới 30% điểm cao nhất bị bỏ.
- Symbol lồng nhau (method đã nằm trong class được chọn) không in 2 lần.
- Không còn dòng summary cấp file — chỉ `=== path ===` + source.

Dedup theo session: trong một session MCP, server nhớ symbol đã gửi.
Hỏi trùng chỉ nhận 1 dòng tham chiếu thay vì source:

```
// AuthService — already sent (src/auth.ts:L10-L80)
```

Muốn gửi lại full thì truyền `fresh: true`. `codei_update` xoá trí nhớ
session vì line range có thể đã lệch sau khi sửa code.

### `codei_update`

Re-index tăng trưởng sau khi code đổi. Chỉ các entry cache nào chạm tới file đã đổi mới bị xoá, còn lại giữ nguyên.

```json
{ "upToDate": false, "filesUpdated": 1, "filesNew": 0, "filesDeleted": 0, "cacheInvalidated": 2, "durationMs": 340 }
```

### `codei_status`

Sức khỏe index + thống kê cache (`{ exists, totalFiles, totalSymbols, builtAt, isStale, staleFiles, cache }`).

## Lưu ý

- Tree index giữ trong RAM, chỉ đọc lại khi `tree.json` đổi mtime.
- Cache traverse lưu ở `.index/traversal-cache.json`, chỉ lưu node ID (không lưu source code), TTL 7 ngày.
- Project phải index trước: `codei index .`
- Suy luận query dùng LLM provider đã cấu hình; với `summaryMode: heuristic` thì chạy offline hoàn toàn bằng heuristic scoring.
