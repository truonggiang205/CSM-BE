# BÁO CÁO ĐÁNH GIÁ CHẤT LƯỢNG & TỔNG KẾT XỬ LÝ CHUỖI NHÁNH VOUCHER/DISCOUNT

**Dự án:** Convenience Store Management (CSM) - Hệ thống Backend Microservices  
**Nhánh tích hợp:** `integration/discount-review`  
**Chuỗi nhánh đánh giá:** `feat/csm-45` -> `feat/csm-46` -> `feat/csm-47` -> `feat/csm-48` -> `feat/csm-51` -> `fix/csm-52` -> `feat/csm-53` -> `feat/csm-54`  
**Tác giả chuỗi tính năng:** Nguyễn Khánh (`DolphinKhnhs`)  
**Người đánh giá & xử lý:** Antigravity / Giang Hà  
**Thời gian hoàn tất:** 25/11/2026  

---

## 1. BẢNG ĐỐI SOÁT HẠNG MỤC: TRƯỚC VÀ SAU KHI SỬA

| STT | Hạng mục kiểm tra | Trạng thái trước khi sửa | Đã sửa chưa | File & Commit khắc phục | File Log Bằng chứng |
| :--- | :--- | :---: | :---: | :--- | :--- |
| **A.1** | Cú pháp SQL `init.sql` cấp quyền `csm_discount` | **BLOCKER** (Lỗi cú pháp thiếu dấu nháy `'` làm hỏng khởi tạo DB) | **ĐÃ SỬA** | `infrastructure/docker/mysql/init.sql`<br>Commit: `8f17513` | `logs/evidence/discount_review/review.md` |
| **A.4** | Phân quyền Gateway & Bảo vệ endpoint nội bộ | **BLOCKER** (Customer tạo được voucher 201; claim/release lộ ra ngoài) | **ĐÃ SỬA** | `apps/discount-service/src/discount.controller.ts`<br>`apps/api-gateway/src/proxy.controller.ts`<br>Commit: `a7a21e8` | `logs/evidence/discount_review/voucher_suite_before.log`<br>`logs/evidence/discount_review/voucher_suite_after.log` |
| **B.4** | Race Condition (10 request đồng thời khi còn 1 lượt) | **BLOCKER** (3/10 request thành công, bị overselling) | **ĐÃ SỬA** | `apps/discount-service/src/discount.service.ts`<br>Commit: `c532601` | `logs/evidence/discount_review/voucher_suite_before.log`<br>`logs/evidence/discount_review/voucher_suite_after.log` |
| **D.1** | Kiểm thử tự động `discount-service` | **BLOCKER** (0 file test unit/integration) | **ĐÃ SỬA** | `apps/discount-service/src/discount.spec.ts`<br>Commit: `52d8709`, `5cf9ec1` | `logs/evidence/discount_review/npm_test_after.log` (20/20 test pass) |
| **B.3** | Lỗi 500 khi rollback tồn kho & Fire-and-forget claim | **HIGH** (Lỗi 500 Internal Error khi voucher lỗi; claim không await) | **ĐÃ SỬA** | `apps/order-service/src/order.controller.ts`<br>Commit: `4f89a5c` | `logs/evidence/discount_review/voucher_suite_after.log` |
| **B.5** | TypeORM Migration cho cột mới trong `order-service` | **HIGH** (Thiếu migration, crash khi `DB_SYNC=false`) | **ĐÃ SỬA** | `apps/order-service/src/migrations/1710000000007-AddDiscountColumnsToOrders.ts`<br>Commit: `76b96f8` | Git tree verification |
| **A.2 & A.3**| Dockerfile package copy & TypeORM migration `discount-service` | **HIGH** (`csm-discount-service` thiếu trong lockfile; synchronize: true) | **ĐÃ SỬA** | `apps/discount-service/Dockerfile`<br>`apps/discount-service/src/app.module.ts`<br>`package-lock.json`<br>Commit: `746718d`, `142e19a` | `logs/evidence/discount_review/docker_rebuild_all_fixed.log` |
| **B.6** | Ràng buộc DTO % giảm tối đa và ngày hiệu lực | **MEDIUM** (Cho phép giảm >100% hoặc ngày kết thúc < bắt đầu) | **ĐÃ SỬA** | `apps/discount-service/src/dto/create-voucher.dto.ts`<br>`apps/discount-service/src/discount.service.ts`<br>Commit: `8342e1b` | `apps/discount-service/src/discount.spec.ts` |
| **C.1** | Phân quyền Frontend route `/admin/vouchers` | **MEDIUM** (Mở nhầm cho cả `BRANCH_MANAGER`) | **ĐÃ SỬA** | `CSM-FE/src/routes/index.tsx`<br>Commit FE: `39835a7` | CSM-FE git log |
| **D.3** | Chuẩn phân trang `{ items, total, page, limit, totalPages }` cho danh sách voucher Admin | **MEDIUM** | **CHƯA SỬA** | `apps/discount-service/src/discount.controller.ts:16` | Giữ nguyên mảng `[]` để không làm gãy giao diện FE hiện tại của Khánh. |
| **D.2** | Chuẩn hoá dọn dẹp log debug thừa | **LOW** | **CHƯA SỬA** | Các dòng log phục vụ quan sát Saga | Không gây rủi ro logic, giữ để debug môi trường dev. |

---

## 2. DANH SÁCH CÁC COMMIT THỰC HIỆN TRÊN NHÁNH `integration/discount-review`

### Repo Backend (CSM-BE):
1. `8f17513` - `fix(discount): fix syntax error in init.sql for csm_discount database grant`
2. `a7a21e8` - `fix(discount): enforce admin role and protect internal endpoints with x-internal-secret`
3. `c532601` - `fix(discount): resolve race conditions and enforce idempotency in claim and release voucher`
4. `4f89a5c` - `fix(discount): fix stock rollback on voucher validation error and await claim voucher with timeout`
5. `76b96f8` - `fix(discount): add TypeORM migration for discount columns in order-service`
6. `746718d` - `fix(discount): restore Dockerfile package copy and support TypeORM migrations with DB_SYNC`
7. `142e19a` - `fix(discount): update package-lock.json to include csm-discount-service workspace`
8. `8342e1b` - `fix(discount): add validation for percentage discount value and date ranges in create voucher`
9. `52d8709` - `fix(discount): add comprehensive Jest unit and integration tests for discount-service`
10. `5cf9ec1` - `test(discount): update end_date in admin create voucher test case`
11. `7246a1e` - `test(discount): add comprehensive voucher E2E test script covering authorization, saga, and concurrency`

### Repo Frontend (CSM-FE):
1. `39835a7` - `fix(discount): restrict admin vouchers route strictly to ADMIN role`

---

## 3. KẾT QUẢ KIỂM THỬ THỰC TẾ (EVIDENCE RUNTIME)

### A. Kiểm thử chuyên sâu Voucher (`scripts/test-voucher-suite.js` - 9 ca)
* **Trước khi sửa:** Đạt 6/9 ca.
  * *Lỗ hổng 1:* Customer gọi `POST /vouchers` tạo voucher thành công (status 201).
  * *Lỗ hổng 2:* Đơn đặt lần 2 vượt giới hạn voucher bị trả về 500 thay vì 400 do rollback kho bị lỗi unhandled exception.
  * *Lỗ hổng 3:* 10 request đồng thời khi còn 1 lượt dùng thì có tới 3 đơn thành công (Race Condition overselling).
* **Sau khi sửa:** **9/9 ca ĐẠT (100%)**
  1. `[CA 1] Tạo voucher hợp lệ bằng token ADMIN` -> **PASS (201 Created)**
  2. `[CA 2] CUSTOMER cố tình gọi POST /vouchers` -> **PASS (Chặn đúng 403 Forbidden)**
  3. `[CA 3.1] Validate voucher hợp lệ` -> **PASS (Tính giảm đúng 20.000đ)**
  4. `[CA 3.2] Validate voucher dưới min_order_value` -> **PASS (Từ chối 400 Bad Request)**
  5. `[CA 3.3] Validate voucher không tồn tại` -> **PASS (Từ chối 404 Not Found)**
  6. `[CA 4] Đặt đơn hàng có voucher và kiểm tra tiền server tính` -> **PASS (Server tính chuẩn: Subtotal 40.000đ, Giảm 20.000đ, Phí ship 15.000đ, Tổng 35.000đ)**
  7. `[CA 5] Đặt đơn lần 2 với cùng voucher vượt giới hạn user` -> **PASS (Báo lỗi 400 Bad Request rõ ràng, kho được giải phóng sạch sẽ)**
  8. `[CA 6] 10 request đồng thời cho voucher còn đúng 1 lượt dùng` -> **PASS (DUY NHẤT 1 đơn thành công, 9 đơn còn lại bị từ chối chính xác)**
  9. `[CA 7] Huỷ đơn hàng đã dùng voucher` -> **PASS (Hoàn lại lượt dùng, mở lại mã cho user thành công)**

### B. Kiểm thử Đơn vị Jest (`npm test`)
* **Trước khi sửa:** 80/80 tests (chưa có test cho discount-service).
* **Sau khi sửa:** **100/100 tests PASS (10 Test Suites, 100% Passed)**.
  * Bổ sung 20 test cases kiểm thử độc lập cho `DiscountService` & `DiscountController` (`apps/discount-service/src/discount.spec.ts`).

### C. Toàn bộ E2E Regression Test (`node scripts/test-e2e.js --cleanup`)
* **Kết quả:** **121/121 ca PASS (100%)**.
  * Toàn bộ 8 nhóm kiểm thử: Auth, Branch Haversine, Inventory, Concurrency kho, Order Saga & State Machine, Order Query CSM-29, Online Payment Simulation, Search & Security uploads đều nguyên vẹn, không phát sinh regression.

### D. Kiểm thử Frontend (CSM-FE)
* `npm run lint` (`tsc --noEmit`): **0 lỗi**
* `npm run build` (`vite build`): **Thành công trong 15.75s**
* `npx playwright test`: 6/8 ca pass (2 ca trượt là do mock selector trong file test cũ `e2e.spec.ts` của FE, không liên quan đến chuỗi voucher mới).

### E. Dữ liệu Demo Seed (`npm run seed:demo`)
* Chạy thành công, bảo toàn tính Idempotent (14 đơn hàng demo sẵn có không bị nhân bản, 26 sản phẩm, 3 chi nhánh, 24 tài khoản).

---

## 4. CÁC ĐIỂM CẦN BÁO CÁO & THỐNG NHẤT VỚI NGUYỄN KHÁNH (`DolphinKhnhs`)

1. **Hợp đồng bảo mật phân quyền:**
   * Các endpoint `POST /vouchers` (tạo) và `PATCH /vouchers/:id/toggle` (bật/tắt), `GET /vouchers/:id/usages` giờ đây bắt buộc phải có JWT mang role `ADMIN`. Token `CUSTOMER` hoặc `BRANCH_MANAGER` sẽ nhận `403 Forbidden`.
   * Các endpoint `POST /vouchers/claim` và `POST /vouchers/release` là endpoint nội bộ giữa các microservices. Gateway sẽ chặn nếu client cố tình gọi trực tiếp từ bên ngoài; downstream service kiểm tra token nội bộ `x-internal-secret`.
2. **Quyết định thiết kế về Concurrency & Idempotency:**
   * Hàm `claimVoucher` và `releaseVoucher` đã được bọc trong TypeORM Transaction với khóa bi quan (`pessimistic_write` - `SELECT ... FOR UPDATE`).
   * Bổ sung cơ chế Idempotent: `claimVoucher` và `releaseVoucher` kiểm tra trạng thái đơn hàng (`order_id`) trong bảng `voucher_usages`. Nếu đơn hàng đã claim rồi thì không trừ lần 2; nếu đơn đã hoàn (REFUNDED) rồi thì gọi lặp lại không làm trừ âm `used_count`.
3. **Đồng bộ hóa Package Lockfile:**
   * Khánh cần lưu ý khi thêm workspace mới (`apps/discount-service`), bắt buộc phải chạy `npm install` ở thư mục gốc để cập nhật `package-lock.json` trước khi build Docker, tránh xóa dòng copy `package*.json` trong Dockerfile.
4. **Phân trang danh sách Voucher:**
   * Hiện tại API `GET /vouchers?all=true` vẫn trả về dạng mảng `Voucher[]` để khớp với `AdminVoucherListPage.tsx` của FE. Trong tương lai, khuyến nghị chuẩn hóa về `{ items, total, page, limit, totalPages }` theo quy ước chung của CSM-BE.

---

## 5. THAO TÁC GHI/XOÁ DỮ LIỆU DATABASE TRONG QUÁ TRÌNH KIỂM TRA

* Toàn bộ các tài khoản test (`cust_voucher_*@csm.vn`) và voucher test (`TEST_VOUCHER_*`, `CONCURRENT_*`) được tạo trong quá trình chạy script kiểm thử chuyên sâu.
* Sau khi bộ kiểm thử hoàn tất, dữ liệu kiểm thử E2E được tự động dọn dẹp bằng cờ `--cleanup`.
* Đã chạy lại `npm run seed:demo` để kiểm tra và xác nhận database đã quay về trạng thái sạch, ổn định.

---

## 6. KẾT LUẬN VỀ KHẢ NĂNG MERGE

* **Nhánh `origin/feat/csm-54-implement-per-user-voucher-usage-limit` gốc:** **CHƯA ĐỦ ĐIỀU KIỆN MERGE** vào dev/main do tồn tại 4 lỗi BLOCKER (Lỗi cú pháp SQL init.sql, Lỗ hổng bảo mật Gateway cho phép Customer tạo voucher, Lỗi Race condition cho phép vượt quá số lượt dùng, và Thiếu hoàn toàn kiểm thử tự động).
* **Nhánh `integration/discount-review`:** **ĐÃ SỬA TOÀN BỘ 4 LỖI BLOCKER VÀ CÁC LỖI HIGH**, 100/100 Jest tests đạt, 121/121 E2E tests đạt, 9/9 ca kiểm thử voucher chuyên sâu đạt.
* **Điều kiện khuyến nghị trước khi merge vào dev và main:**
  1. Tổ chức một buổi trao đổi ngắn với Nguyễn Khánh để Khánh nắm rõ các hợp đồng API nội bộ (`x-internal-secret`) và phân quyền `ADMIN`.
  2. Tạo Pull Request từ nhánh `integration/discount-review` vào `origin/dev`.
