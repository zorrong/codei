# 🚀 Introducing codei: Giảm 95% chi phí AI coding

**Mỗi ngày bạn paste code vào ChatGPT, bạn đang đốt tiền cho những context không liên quan.**

> Ghi chú thương hiệu: `codei` là tên mới của `Codeindex`. Chữ `i` đại diện cho cả `index` và `intelligent`. Lệnh CLI là `codei`, gói npm để cài CLI là `pnftrading_codei`, còn core/adapters được publish dưới `pnftrading_codei-*`.
> npm package: https://www.npmjs.com/package/pnftrading_codei

***

## Vấn đề thực sự

Bạn đang trả **$20-100/tháng** cho các công cụ AI coding. Nhưng có một bí mật:

| Hành động                      | Chi phí thực          |
| ------------------------------ | --------------------- |
| Paste toàn bộ file vào ChatGPT | \~50,000 tokens/query |
| Claude phân tích codebase      | $0.03-0.15/query      |
| Context overflow               | Frustration = vô giá  |

**80% budget AI của bạn bị lãng phí cho context không liên quan.**

Mỗi lần `CTRL+C → CTRL+V` đốt tokens cho code chẳng liên quan gì đến câu hỏi. Bạn đang trả tiền cho "soup context" khi chỉ cần một thành phần.

***

## Giải pháp

`codei` xây dựng một **cây index phân cấp** của codebase. Khi bạn hỏi, LLM reasoning chọn chính xác module, file, và symbol nào liên quan — rồi trả về chỉ phần đó.

**Kết quả: \~1,000-3,000 tokens/query thay vì 50,000+**

```
Before: Paste 200 files (50KB) → Hỏi "fix login bug"
After:  Paste 3 files (2KB)   → Cùng câu trả lời
```

***

## Tại sao dùng codei?

| <br />           | codei          | Vector Embeddings | Copy-Paste thủ công |
| ---------------- | -------------- | ----------------- | ------------------- |
| **Tokens/query** | \~2 KB         | \~100 KB          | 50+ KB              |
| **Setup**        | 2 phút         | 30 phút           | 0                   |
| **Độ chính xác** | LLM reasoning  | Cosine similarity | Bạn đoán            |
| **Cập nhật**     | Tức thì        | Re-embed toàn bộ  | Thủ công            |
| **Privacy**      | 100% local     | Data离开 máy        | Bạn kiểm soát       |
| **Chi phí**      | Miễn phí (MIT) | $20-100/tháng     | Miễn phí (lãng phí) |

***

## Tiết kiệm bao nhiêu?

| Quy mô dự án | Trước            | Sau          | Tiết kiệm       |
| ------------ | ---------------- | ------------ | --------------- |
| 50 files     | 15,000 tokens    | 800 tokens   | **$0.05/query** |
| 200 files    | 60,000 tokens    | 1,500 tokens | **$0.15/query** |
| 500+ files   | Context overflow | 2,500 tokens | **Vô giá**      |

10 queries/ngày = **$15-45/tháng** tiết kiệm được.

***

## Tính năng

- **Vectorless Architecture** — Không embeddings, không external storage, không chi phí hàng tháng
- **LLM Reasoning** — Hỏi "code nào liên quan?" thay vì "code nào similar?"
- **Multi-Language** — TypeScript, Python, Go, Rust, Java, C#, C++, PHP, Swift
- **Incremental Updates** — Chỉ re-index files đã thay đổi
- **IDE Integration** — HTTP API cho VSCode, JetBrains, Neovim, Claude Code, Cursor
- **Git Hook Ready** — Tự động update index sau commits
- **Production Ready** — API key auth, rate limiting, structured logging

***

## Quick Start

```bash
# 1. Cài đặt
npm install -g pnftrading_codei

# 2. Setup (một lần)
codei setup

# 3. Index dự án
cd your-project
codei index .

# 4. Query!
codei query "Authentication hoạt động thế nào?"
```

**Không cần cloud signup, không API costs, không vector database.**

***

## Cách hoạt động

```
┌─────────────────────────────────────────────────────────────┐
│                      Câu hỏi của bạn                        │
│            "Authentication validation hoạt động sao?"        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    codei Index                                │
│                                                              │
│   Project                                                     │
│   └── src/                                                    │
│       ├── auth/              ← LLM chọn module này         │
│       │   ├── login.ts       ← Và những files này           │
│       │   └── validators.ts                                      │
│       └── users/                                             │
│           └── ...                                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       Response                               │
│                                                              │
│   auth/validators.ts + auth/login.ts (2KB)                  │
│   "Đây là các validation functions..."                         │
└─────────────────────────────────────────────────────────────┘
```

***

## IDE Integrations

### Claude Code

```bash
curl -s -X POST http://localhost:3131/query \
  -d '{"query": "$1", "maxTokens": 3000}' | jq -r '.context'
```

### Cursor / Windsurf

```
Khi cần context, chạy:
  curl -s -X POST http://localhost:3131/query -d '{"query": "CÂU_HỎI"}' | jq -r '.context'
```

***

## Supported Languages

TypeScript • Python • Go • Rust • Java • C# • C++ • PHP • Swift

*Cần ngôn ngữ khác? Adapter pattern giúp thêm dễ dàng.*

***

## Open Source

MIT License — Sử dụng tự do, kể cả trong dự án thương mại.

**GitHub:** <https://github.com/zorrong/codei>

**Website:** <https://zorrong.github.io/codei>\
Vercel: 

**ủng hộ:** <https://paypal.me/zorrong> ☕

***

## Kết luận

`codei` giúp bạn:

1. **Tiết kiệm 95% tokens** cho mỗi query
2. **Không cần external services** — chạy 100% local
3. **Tích hợp mọi IDE** — VSCode, JetBrains, Neovim, Claude, Cursor
4. **Hỗ trợ 9 ngôn ngữ** phổ biến

**Ngừng trả tiền cho context không cần thiết. Bắt đầu dùng codei.**
