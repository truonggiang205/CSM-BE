# Quy ước viết mã (Coding Convention) – CSM Backend

Tài liệu này là quy tắc nhóm 04 thống nhất và đang áp dụng trong repo CSM-BE. ESLint (`eslint.config.js`) và CI (`.github/workflows/ci.yml`) kiểm tra tự động các quy tắc có thể kiểm tra bằng máy.

## 1. Ngôn ngữ và công cụ
- TypeScript cho toàn bộ service (NestJS 10), Node.js 22.
- Kiểm tra tĩnh: `npm run lint:eslint` (cấu hình `typescript-eslint` recommended). Lỗi ESLint (error) chặn CI; cảnh báo (warning) được ghi vào báo cáo và giảm dần.
- Kiểm thử: Jest + ts-jest, tệp `*.spec.ts` đặt cạnh mã nguồn trong `apps/<service>/src`.

## 2. Cấu trúc thư mục
- Mỗi service một thư mục `apps/<tên>-service/src` gồm `main.ts`, `app.module.ts`, `*.controller.ts`, `*.service.ts` (nếu có), `dto/`, `entities/`, `guards/`, `migrations/`.
- Mã dùng chung đặt trong `libs/` (`libs/config`, `libs/database`).
- Mỗi service chỉ truy cập CSDL của chính nó (Database per Service). Dữ liệu của service khác chỉ lấy qua HTTP API.

## 3. Đặt tên
| Đối tượng | Quy ước | Ví dụ |
|---|---|---|
| Tên tệp | kebab-case + hậu tố vai trò | `create-order.dto.ts`, `stock-transaction.entity.ts` |
| Class, Enum, DTO | PascalCase | `CreateOrderDto`, `OrderStatus` |
| Biến, hàm, thuộc tính DTO | camelCase | `branchId`, `reserveStock()` |
| Cột và bảng CSDL | snake_case, bảng số nhiều | `reserved_quantity`, `stock_transactions` |
| Giá trị enum | UPPER_SNAKE_CASE | `BRANCH_MANAGER`, `CANCEL_RESERVE` |
| Biến môi trường | UPPER_SNAKE_CASE | `INTERNAL_SECRET`, `DISCOUNT_SERVICE_URL` |
| Migration | `<timestamp>-<MôTả>.ts` | `1710000000017-AddReturnTransactionType.ts` |

## 4. API
- Đường dẫn REST danh từ số nhiều, kebab-case: `/orders`, `/flash-sales`, `/inventory/reserve-stock`.
- Dữ liệu vào được kiểm tra bằng DTO + `class-validator`; thông báo lỗi trả về tiếng Việt, mã HTTP đúng ngữ nghĩa (400, 401, 403, 404, 409).
- API nội bộ giữa các service bắt buộc header `x-internal-secret`; API theo vai trò dùng `RolesGuard` đọc header `x-user-role` do API Gateway gắn.
- Mọi API mới phải có mô tả Swagger.

## 5. Dữ liệu và giao dịch
- Không dùng `synchronize` ở môi trường chạy thật; thay đổi CSDL bằng migration có kiểm tra `information_schema` để chạy lại an toàn.
- Thao tác tồn kho và voucher dùng khóa `pessimistic_write` trong transaction và có `reference_id` để chống xử lý lặp (idempotency).
- Đơn hàng lưu ảnh chụp giá (`*_snapshot`), không đọc lại giá sản phẩm sau khi đặt.

## 6. Bảo mật
- Không commit `.env`, mật khẩu, token, khóa API. Bí mật chỉ đọc từ biến môi trường; service dừng khi thiếu biến bắt buộc hoặc khóa dưới 32 ký tự.
- Không trả `password_hash` ra ngoài (dùng hàm `toPublicUser`).
- CI chạy gitleaks trên toàn bộ lịch sử commit.

## 7. Git
- Nhánh: `main` (bản nộp, build được), `dev` (tích hợp), nhánh tính năng `feat/<mô-tả>`, `fix/<mô-tả>`, `chore/<mô-tả>`, `refactor/<mô-tả>`.
- Commit theo Conventional Commits: `<loại>(<phạm vi>): <mô tả>`, ví dụ `feat(order): hoàn kho khi huỷ đơn`. Loại: feat, fix, chore, docs, refactor, test, revert.
- Mọi thay đổi vào `dev`/`main` qua Pull Request; CI phải xanh trước khi merge.
