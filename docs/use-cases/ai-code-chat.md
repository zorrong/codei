# Use Case: AI Code Chat With codei

## Mục tiêu

Tài liệu này hướng dẫn cách tích hợp `codei` vào một ứng dụng AI Code Chat, nơi người dùng đặt câu hỏi về codebase như:

- "Auth flow hoạt động như thế nào?"
- "Webhook Stripe được xử lý ở đâu?"
- "Luồng tạo order đi qua những file nào?"
- "Hàm này đang được gọi từ đâu?"

Mục tiêu của `codei` trong kiến trúc này là:

- lấy đúng context liên quan từ codebase trước khi gọi LLM chat
- giảm token và chi phí so với việc paste cả repo hoặc nhiều file dài
- tăng độ chính xác vì context được chọn theo module, file và symbol thực tế
- tách rõ lớp truy xuất code context khỏi lớp sinh câu trả lời tự nhiên

## Khi nào nên dùng

Case này phù hợp khi:

- repo đủ lớn để không thể đưa toàn bộ vào prompt
- người dùng thường hỏi về cấu trúc, luồng chạy, dependency hoặc bug trace
- bạn muốn backend chat có thể trả về cả câu trả lời lẫn danh sách file liên quan
- bạn cần một dịch vụ context retrieval nội bộ, có HTTP API và dễ tích hợp

Case này không cần thiết nếu:

- ứng dụng chỉ làm demo cho repo rất nhỏ
- người dùng luôn hỏi trong phạm vi 1 file đã biết sẵn
- bạn chưa cần một lớp truy xuất context riêng biệt

## Kiến trúc đề xuất

Thành phần chính:

- `Frontend Chat`: giao diện người dùng nhập câu hỏi
- `App Backend`: dịch vụ điều phối, gọi `codei` rồi gọi model chat
- `codei Server`: dịch vụ HTTP cục bộ hoặc nội bộ chạy trên repo đã được index
- `LLM Provider`: Claude, OpenAI, Gemini hoặc model chat khác

Luồng dữ liệu:

1. Người dùng gửi câu hỏi từ giao diện chat.
2. Backend chuẩn hóa câu hỏi cho phù hợp với truy vấn code.
3. Backend gọi `POST /query` của `codei`.
4. `codei` trả về `context`, `files`, `estimatedTokens`, `traversalPath`.
5. Backend ghép `context` vào prompt gửi sang model chat.
6. Model chat tạo câu trả lời cuối.
7. Backend trả câu trả lời cùng danh sách file liên quan cho frontend.

## Vì sao `codei` phù hợp cho AI Code Chat

`codei` đã có sẵn các thành phần cần thiết cho mô hình này:

- HTTP server với `POST /query`, `POST /update`, `GET /status`, `GET /health`
- API key auth qua `X-Codei-Api-Key` hoặc `Authorization: Bearer`
- rate limiting và cấu hình CORS
- output có cấu trúc phù hợp cho app chat: `context`, `files`, `estimatedTokens`

Xem thêm:

- [API.md](file:///home/zorrong/codeindex-final/docs/API.md)
- [HttpServer.ts](file:///home/zorrong/codeindex-final/packages/cli/src/server/HttpServer.ts)

## Chuẩn bị môi trường

### 1. Cài CLI

```bash
pnpm install -g @pnftrading/codei
```

### 2. Thiết lập provider

```bash
codei setup
```

Hoặc dùng `.env` / `~/.codei/.env` nếu bạn muốn quản lý cấu hình bằng biến môi trường.

### 3. Index repo

```bash
cd /path/to/your-project
codei index .
```

Khuyến nghị:

```bash
codei index . --summary-mode heuristic
```

Chế độ `heuristic` phù hợp cho production ổn định, giảm phụ thuộc vào LLM khi index.

### 4. Kiểm tra trạng thái index

```bash
codei status .
```

Nếu ứng dụng của bạn có dashboard nội bộ, hãy hiển thị:

- index đã tồn tại hay chưa
- số lượng file
- số lượng symbol
- `builtAt`
- `isStale`

## Chạy `codei` server

Khởi động server:

```bash
codei serve . --port 3131 --host 127.0.0.1 --api-key my-secret-key
```

Nếu backend app và `codei` nằm cùng mạng nội bộ, đây là cấu hình đủ tốt cho MVP.

### Cấu hình khuyến nghị

Ví dụ `.codei.json` tối thiểu:

```json
{
  "indexDir": ".index",
  "projectName": "my-project",
  "summaryMode": "heuristic",
  "serverApiKey": "my-secret-key",
  "serverCorsOrigin": "*",
  "serverMaxBodyBytes": 1048576,
  "serverRateLimitPerMinute": 120
}
```

## Contract API cần dùng trong ứng dụng

### `POST /query`

Endpoint chính để lấy context từ codebase.

Request:

```json
{
  "query": "How does authentication work in this codebase?",
  "maxTokens": 3000,
  "maxSymbols": 8
}
```

Response mẫu:

```json
{
  "query": "How does authentication work in this codebase?",
  "estimatedTokens": 1450,
  "traversalPath": [
    "root-descend [mod:src]",
    "modules: [mod:auth]",
    "selected: [file:src/auth/auth.service.ts]"
  ],
  "files": [
    {
      "path": "src/auth/auth.service.ts",
      "symbols": ["AuthService", "login", "refreshToken"]
    }
  ],
  "context": "=== src/auth/auth.service.ts ===\nclass AuthService {\n  async login(credentials) { ... }\n}"
}
```

### `POST /update`

Gọi endpoint này khi repo thay đổi và bạn muốn cập nhật index mà không build lại toàn bộ.

### `GET /status`

Dùng cho dashboard hoặc readiness check của backend để biết index có tồn tại và có bị stale không.

### `GET /health`

Dùng làm health check đơn giản cho process `codei`.

## Cách backend nên tích hợp

Khuyến nghị mạnh:

- không cho frontend gọi trực tiếp `codei`
- chỉ backend của ứng dụng mới được quyền gọi `codei`
- giữ API key ở backend
- gom logging, retry, timeout và error mapping tại backend

Luồng backend đề xuất:

1. Nhận câu hỏi từ frontend.
2. Chuẩn hóa câu hỏi thành truy vấn code rõ nghĩa hơn.
3. Gọi `codei /query`.
4. Nếu query thành công, ghép `context` vào prompt cho model chat.
5. Gọi model chat.
6. Trả `answer`, `sources`, `estimatedTokens` về frontend.

## Ví dụ backend Node.js

Ví dụ đơn giản bằng `fetch`:

```ts
type CodeiQueryResponse = {
  query: string
  context: string
  estimatedTokens: number
  traversalPath: string[]
  files: Array<{
    path: string
    symbols: string[]
  }>
}

export async function fetchCodeiContext(question: string): Promise<CodeiQueryResponse> {
  const res = await fetch("http://127.0.0.1:3131/query", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Codei-Api-Key": process.env.CODEI_SERVER_API_KEY ?? "",
    },
    body: JSON.stringify({
      query: question,
      maxTokens: 3000,
      maxSymbols: 8,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`codei query failed: ${res.status} ${text}`)
  }

  return (await res.json()) as CodeiQueryResponse
}
```

Ví dụ orchestration:

```ts
type ChatResponse = {
  answer: string
  sources: Array<{ path: string; symbols: string[] }>
  estimatedTokens: number
}

function buildPrompt(userQuestion: string, codei: CodeiQueryResponse): string {
  return `
Bạn là trợ lý kỹ thuật cho codebase này.
Chỉ trả lời dựa trên context được truy xuất.
Nếu context chưa đủ, nói rõ giới hạn thay vì suy đoán.

Câu hỏi người dùng:
${userQuestion}

Context từ codei:
${codei.context}

File liên quan:
${codei.files.map((f) => `- ${f.path}: ${f.symbols.join(", ")}`).join("\n")}
`.trim()
}

export async function answerCodeQuestion(userQuestion: string): Promise<ChatResponse> {
  const codei = await fetchCodeiContext(userQuestion)
  const prompt = buildPrompt(userQuestion, codei)

  // Thay bằng client của model chat bạn đang dùng.
  const answer = await callYourChatModel(prompt)

  return {
    answer,
    sources: codei.files,
    estimatedTokens: codei.estimatedTokens,
  }
}

declare function callYourChatModel(prompt: string): Promise<string>
```

## Chiến lược viết query cho `codei`

Chất lượng câu hỏi gửi vào `codei` ảnh hưởng trực tiếp đến chất lượng context.

Không nên:

- "giải thích cả hệ thống"
- "auth đâu"
- "code này chạy sao"

Nên dùng:

- "How does JWT authentication work in this codebase?"
- "Trace the request flow for order creation."
- "Where is Stripe webhook processing implemented?"
- "What files are involved in updating a user profile?"

Nếu frontend cho phép user nhập câu hỏi tự do, backend nên rewrite truy vấn trước khi gửi sang `codei`.

Ví dụ:

- User: `auth hoạt động sao?`
- Query rewrite: `How does authentication work in this codebase? Trace login and refresh token flow.`

## Thiết kế response cho frontend

UI không nên chỉ hiển thị mỗi câu trả lời của model.

Nên trả thêm:

- `sources`: danh sách file và symbol mà `codei` đã chọn
- `estimatedTokens`: để debug và tối ưu prompt budget
- `debug.traversalPath`: chỉ bật cho môi trường nội bộ

Ví dụ:

```json
{
  "answer": "Luồng auth bắt đầu ở AuthService, sau đó gọi UserService để lấy user và refresh token...",
  "sources": [
    {
      "path": "src/auth/auth.service.ts",
      "symbols": ["AuthService", "login", "refreshToken"]
    }
  ],
  "estimatedTokens": 1450
}
```

## Cập nhật index khi code thay đổi

Có 3 chiến lược phổ biến:

### 1. Manual refresh

Backend hoặc admin panel có nút "Refresh index".

```bash
curl -X POST http://127.0.0.1:3131/update \
  -H "X-Codei-Api-Key: my-secret-key"
```

### 2. Trigger sau deploy

Sau khi deploy xong repo mới, gọi `POST /update`.

### 3. Trigger sau merge / CI

Khi branch được merge vào main, pipeline có thể gọi cập nhật index.

Nếu repo thay đổi nhiều và liên tục, hãy lập lịch refresh định kỳ hoặc gọi `codei update .` trong worker riêng.

## Xử lý lỗi trong ứng dụng

Các lỗi phổ biến từ `codei`:

### `401 UNAUTHORIZED`

Nguyên nhân:

- thiếu `X-Codei-Api-Key`
- sai API key

UI nên hiển thị lỗi vận hành nội bộ, không nên đẩy raw message cho user cuối.

### `404 NO_INDEX`

Nguyên nhân:

- repo chưa được index
- index bị mất hoặc chưa mount đúng volume

Hướng xử lý:

- gọi `codei index .`
- kiểm tra path repo và thư mục `.index`

### `429 RATE_LIMITED`

Nguyên nhân:

- ứng dụng gửi quá nhiều request/phút tới `codei`

Hướng xử lý:

- queue request
- debounce query từ frontend
- cache câu hỏi lặp

### `400 BAD_REQUEST`

Nguyên nhân:

- body JSON không hợp lệ
- thiếu trường `query`

## Bảo mật và vận hành

Khuyến nghị production:

- luôn bật API key
- không mở `codei` trực tiếp ra public internet
- để `codei` sau backend hoặc reverse proxy nội bộ
- giới hạn CORS nếu frontend/backend chạy khác origin
- log request ID để dễ trace lỗi
- dùng timeout rõ ràng ở backend khi gọi `codei`

Nếu bạn chạy nhiều repo:

- mỗi repo nên có một instance `codei` riêng
- backend route theo `repoId`
- không nên dùng một index chung cho nhiều repo khác nhau

## MVP đề xuất

MVP nhanh nhất:

1. Một repo
2. Một instance `codei serve`
3. Một backend chat
4. Một model chat
5. Một nút "Reindex"

Flow MVP:

1. `codei index .`
2. `codei serve .`
3. Backend gọi `/query`
4. Backend gọi LLM
5. Frontend hiển thị answer + source files

## Checklist production

- `codei index` đã chạy thành công
- `codei serve` có health check
- API key được bật
- backend gọi `codei`, không để frontend gọi trực tiếp
- có retry hoặc timeout hợp lý
- có `POST /update` sau deploy hoặc merge
- có hiển thị `sources` cho người dùng
- có log `estimatedTokens` để tối ưu chi phí

## Lệnh mẫu để thử nhanh

Khởi động:

```bash
cd /path/to/your-project
codei index .
codei serve . --port 3131 --api-key my-secret-key
```

Query:

```bash
curl -X POST http://127.0.0.1:3131/query \
  -H "Content-Type: application/json" \
  -H "X-Codei-Api-Key: my-secret-key" \
  -d '{
    "query": "How does authentication work in this codebase?",
    "maxTokens": 3000,
    "maxSymbols": 8
  }'
```

Update:

```bash
curl -X POST http://127.0.0.1:3131/update \
  -H "X-Codei-Api-Key: my-secret-key"
```

Status:

```bash
curl http://127.0.0.1:3131/status \
  -H "X-Codei-Api-Key: my-secret-key"
```

Health:

```bash
curl http://127.0.0.1:3131/health
```

## Kết luận

`codei` phù hợp làm lớp context retrieval cho ứng dụng AI Code Chat vì:

- có CLI và HTTP API sẵn
- dễ tích hợp vào backend hiện có
- giảm token so với copy-paste thủ công
- trả ra context có cấu trúc và bám vào file thật trong repo
- hỗ trợ vận hành production với auth, rate limit và update flow

Thiết kế nên ưu tiên:

- backend orchestration rõ ràng
- query rewrite tốt
- hiển thị source files cho user
- cập nhật index theo vòng đời codebase
