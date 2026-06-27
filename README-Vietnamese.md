# Codei

**Vectorless, reasoning-based code index cho AI context retrieval.**

Thay vì dump toàn bộ codebase vào prompt (50k+ tokens), `codei` build một hierarchical tree index và dùng LLM reasoning để tìm đúng context — giảm từ **50,000+ token xuống còn ~1,000-3,000 token** per query.

> Ghi chú thương hiệu: `codei` là tên mới của `Codeindex`. Chữ `i` mang hai ý nghĩa: `index` và `intelligent`. Lệnh CLI là `codei`, gói npm để cài CLI là `pnftrading_codei`, còn core/adapters được publish dưới `pnftrading_codei-*`.
> npm package: https://www.npmjs.com/package/pnftrading_codei

Inspired by [PageIndex](https://github.com/VectifyAI/PageIndex), adapted cho codebase TypeScript.

---

## Cài đặt nhanh

```bash
# Clone repo
git clone <this-repo>
cd <repo-folder>

# Install dependencies
pnpm install

# Build tất cả packages
pnpm build

# Link CLI toàn cục (dành cho phát triển)
cd packages/cli && pnpm link --global

# Chạy test toàn bộ dự án
pnpm test
pnpm test:watch # Chế độ theo dõi thay đổi

# Cấu hình API Key toàn cục (CHỈ CẦN LÀM 1 LẦN)
codei setup

```

---

## Sử dụng trong project của bạn

### Bước 1 — Thiết lập toàn cục (Global Setup)

Thay vì phải khai báo API Key cho mỗi dự án, bạn chỉ cần chạy lệnh sau một lần duy nhất khi vừa cài đặt:

```bash
codei setup
```

Lệnh này sẽ hỏi bạn Provider (OpenAI, Gemini, v.v.), API Key, Model name và Base URL (nếu có).

Thông tin này sẽ được lưu tại `~/.codei/config.json` và áp dụng cho **tất cả** các dự án sau này.

### Bước 2 — Khởi tạo dự án (Init project)

Khi bắt đầu dự án mới, bạn chỉ cần dùng `init`. Nó sẽ tự nhận diện cấu hình toàn cục của bạn:

```bash
cd /path/to/your-project
codei init
```

Nhấn **Enter** để xác nhận các giá trị mặc định được lấy từ `setup`. File `.codei.json` sẽ được tạo:

```json
{
  "provider": "openai",
  "model": "gpt-4o",
  "indexDir": ".index"
}
```

> [!TIP]
> Bạn vẫn có thể ghi đè (override) cấu hình toàn cục bằng cách sửa file `.codei.json` dự án hoặc dùng biến môi trường.

**Thứ tự ưu tiên (Priority):**
`Mặc định < Toàn cục (~/.codei) < Dự án (.codei.json) < Biến môi trường (ENV) < CLI flags`

**Providers được hỗ trợ:**
| Provider | Biến ENV | Model mặc định |
|---|---|---|
| `openai` | `OPENAI_API_KEY` | `gpt-4o` |
| `anthropic` | `ANTHROPIC_API_KEY` | `claude-sonnet-4-5` |
| `google` | `GOOGLE_API_KEY` | `gemini-1.5-flash` |
| `custom` | `CUSTOM_API_KEY` | `gpt-4o-compatible` |
| `ollama` | _(không cần)_ | `llama3.2` |

### Bước 3 — Build index lần đầu

```bash
codei index .
```

Output:
```
📁 Indexing: /your-project
🤖 Provider: openai / gpt-4o
📂 Index dir: .index

✅ Index built successfully!
   Files indexed : 142
   Symbols found : 891
   Duration      : 47.3s
   Output        : /your-project/.index/
```

### Bước 4 — Query

```bash
codei query "How does authentication work?"
```

Output sẵn sàng paste vào Claude/GPT:
```
=== src/auth/auth.service.ts ===
// Handles JWT-based authentication
class AuthService {
  async login(dto: LoginDto): Promise<TokenPair> { ... }
  validateToken(token: string): JwtPayload { ... }
}

// --- Dependencies (signatures only) ---
// src/user/user.service.ts
class UserService
```

---

## Commands

```bash
codei setup                # Cấu hình API Key/Provider toàn cục
codei init [path]          # Setup config file cho project mới
codei index [path]         # Full rebuild index dự án
codei query "<text>"       # Query và lấy code context
codei update [path]        # Update index (sau git commit)
codei status [path]        # Kiểm tra sức khỏe index
codei serve [path]         # Start server cho IDE integration
```

### Options hay dùng

```bash
# Query với output dạng JSON
codei query "auth flow" --format json

# Giới hạn token output
codei query "payment logic" --max-tokens 2000

# Không expand dependencies
codei query "UserService" --no-deps

# Verbose — xem LLM traversal path
codei query "how login works" -v

# Serve trên port khác
codei serve . --port 4000
```

---

## Auto-update sau mỗi git commit

```bash
# Copy git hook vào project của bạn
cp packages/cli/src/hooks/post-commit.sh /your-project/.git/hooks/post-commit
chmod +x /your-project/.git/hooks/post-commit
```

Sau đó mỗi `git commit`, index tự update chỉ các files thay đổi (thường < 5 giây).

---

## Tích hợp IDE & AI Agent

`codei` cung cấp một HTTP server chạy local, đóng vai trò là "nguồn tri thức" cho các công cụ AI ưa thích của bạn.

### 1. Khởi chạy Server
Luôn giữ server chạy ở một terminal nền:
```bash
codei serve . --port 3131
```

### 2. Tích hợp với Claude Code
Tạo một script hỗ trợ tại `~/.claude/tools/codei.sh`:
```bash
#!/bin/bash
# Tool: codei
# Description: Lấy context code liên quan từ index local
QUERY="$1"
curl -s -X POST http://localhost:3131/query \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"$QUERY\", \"maxTokens\": 3000}" \
  | jq -r '.context'
```

### 3. Tích hợp với Cursor / Windsurf
Tạo file `.cursorrules` hoặc `.windsurfrules` ở thư mục gốc project để hướng dẫn AI cách dùng codei:

```markdown
# Truy vấn ngữ cảnh từ Codei
Khi bạn cần hiểu codebase hoặc lần theo chuỗi dependency:
1. Chạy lệnh này để lấy các đoạn mã liên quan:
   curl -s -X POST http://localhost:3131/query -d '{"query": "CÂU_HỎI_CỦA_BẠN"}' | jq -r '.context'
2. Sử dụng kết quả trả về để lập luận và thực hiện code.
```

### 4. Tích hợp với Cline (VSCode)
Trong chế độ "Plan Mode" hoặc "Custom Instruction" của Cline, bạn có thể hướng dẫn CLI chạy:
`codei query "câu hỏi của bạn" --format text`
Sau đó dùng kết quả trả về làm ngữ cảnh.

---

## Các API Endpoints

Server (mặc định: `localhost:3131`) cung cấp các endpoint:

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/health` | Kiểm tra tình trạng server |
| `POST` | `/query` | Truy vấn context code (Xem body mẫu trong `HttpServer.ts`) |
| `POST` | `/update` | Kích hoạt cập nhật index tăng trưởng |
| `GET` | `/status` | Xem thống kê index hiện tại |

## Cấu trúc project

```
codei/
├── packages/
│   ├── core/                    # Core engine — language-agnostic
│   │   ├── src/tree/            # TreeBuilder, TreeTraversal
│   │   ├── src/retrieval/       # Retriever, DependencyExpander, ContextBuilder
│   │   ├── src/llm/             # SummaryGenerator, TraversalReasoner
│   │   └── src/storage/         # FileSystemIndexStore, IndexManager, FileScanner
│   ├── adapter-typescript/      # TypeScript parser (ts-morph)
│   └── cli/                     # CLI commands + HTTP server
└── .index/                      # Generated index (gitignored)
    ├── tree.json
    └── meta.json
```

---

## Các thư mục mặc định được bỏ qua

Khi chạy `codei index`, scanner sẽ tự động:

1. **Sử dụng danh sách mặc định** cho các thư mục phổ biến:
```typescript
const DEFAULT_IGNORE = [
  "node_modules",   // Dependencies
  "dist",           // Build output
  "build",          // Build output
  ".git",           // Git metadata
  ".index",         // Index data
  "coverage",       // Test coverage reports
  ".next",          // Next.js build
  ".nuxt",          // Nuxt.js build
]
```

2. **Đọc file `.gitignore`** của bạn — bất kỳ thư mục/file nào đã được khai báo trong `.gitignore` sẽ tự động được bỏ qua.

> [!TIP]
> Điều này có nghĩa là bạn chỉ cần quản lý một file: `.gitignore`. Chỉ cần thêm các thư mục bạn muốn bỏ qua vào đó, `codei` sẽ tự động nhận biết.

---

## Token reduction estimate

| Project size | Before (dump all) | After (codei) | Reduction |
|---|---|---|---|
| Small (50 files) | ~15,000 tokens | ~800 tokens | **94%** |
| Medium (200 files) | ~60,000 tokens | ~1,500 tokens | **97%** |
| Large (500+ files) | context overflow | ~2,500 tokens | ✅ feasible |

---

## Thêm ngôn ngữ mới (Phase 6)

Implement `LanguageAdapter` interface:

```typescript
import type { LanguageAdapter } from "pnftrading_codei-core"

export class PythonAdapter implements LanguageAdapter {
  readonly language = "python"
  readonly fileExtensions = [".py"]

  async parseFile(filePath, projectRoot): Promise<ParsedFile> {
    // Parse .py file với Python AST (child_process hoặc tree-sitter)
  }
  supports(filePath: string) { return filePath.endsWith(".py") }
  async resolveImport(...) { ... }
}
```

---

## Hướng dẫn AI Agent (Project-level AGENTS.md)

Để giúp các Agent (như Claude Code, Cursor, Cline) biết cách tự động sử dụng `codei` trong dự án của bạn, hãy tạo một file `AGENTS.md` ở thư mục gốc của dự án.

**Nội dung mẫu (Copy vào `AGENTS.md` dự án của bạn):**

```markdown
# Hướng dẫn AI Agent cho dự án này

Dự án này sử dụng `codei` để lấy ngữ cảnh code chính xác. Trước khi thực hiện các thay đổi lớn hoặc giải đáp các thắc mắc chuyên sâu về logic, hãy truy vấn index:

## Các lệnh Agent có thể dùng:
- `codei query "Câu hỏi của bạn"`: Lấy đúng context code liên quan.
- `codei update`: Cập nhật index sau khi bạn đã thay đổi mã nguồn.
- `curl -s -X POST http://localhost:3131/query -d '{"query": "..."}'`: Nếu server đang chạy ở cổng 3131.
```
