---
"pnftrading_codei-core": minor
"pnftrading_codei": minor
---

Vòng 3 (tiết kiệm token sâu hơn trong ContextBuilder + MCP):

- Dedup symbol lồng nhau: method nằm trong class đã chọn không in 2 lần
  (trừ khi class bị truncate, method vẫn giữ)
- Render theo hạng điểm: top-3 full body, còn lại signature + vị trí dòng
- Cắt theo khoảng cách điểm: bỏ symbol <30% max score (budget là trần)
- MCP session dedup: symbol đã gửi chỉ còn dòng tham chiếu,
  `fresh: true` để gửi lại, `codei_update` xoá trí nhớ session
- Bỏ dòng summary cấp file khỏi context
