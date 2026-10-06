---
"pnftrading_codei-core": minor
"pnftrading_codei": minor
---

Vòng 2 (theo gợi ý còn thiếu):

- Heuristic summary kèm doc comment đầu tiên của file
- Direct file mode: query trùng path file trả thẳng, không gọi LLM
- Telemetry local: query-log.jsonl + lệnh `codei stats`
- `codei status --fail-if-stale` (exit 2) cho CI
- Config `ignore` trong .codei.json để loại thư mục khỏi index
