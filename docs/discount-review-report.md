# BÁO CÁO ĐÁNH GIÁ CHẤT LƯỢNG & TỔNG KẾT XỬ LÝ CHUỖI NHÁNH VOUCHER/DISCOUNT (PHASE 1 & PHASE 2)

**Dự án:** Convenience Store Management (CSM) - Hệ thống Backend Microservices & Frontend Web  
**Nhánh tích hợp BE:** `integration/discount-review` (tại `CSM-BE`)  
**Nhánh tích hợp FE:** `integration/discount-review` (tại `CSM-FE`)  
**Chuỗi nhánh đánh giá:** `feat/csm-45` -> `feat/csm-46` -> `feat/csm-47` -> `feat/csm-48` -> `feat/csm-51` -> `fix/csm-52` -> `feat/csm-53` -> `feat/csm-54`  
**Tác giả chuỗi tính năng:** Nguyễn Khánh (`DolphinKhnhs`)  
**Người đánh giá & xử lý:** Antigravity / Giang Hà  
**Thời gian hoàn tất:** 25/11/2026  

---

## 1. BẢNG ĐỐI SOÁT TOÀN DIỆN CÁC HẠNG MỤC (TRƯỚC & SAU KHI SỬA)

| STT | Hạng mục kiểm tra | Trạng thái trước khi sửa | Đã sửa chưa | File & Commit khắc phục | Bằng chứng (Log File) |
| :--- | :--- | :---: | :---: | :--- | :--- |
| **A.1** | Cú pháp SQL `init.sql` cấp quyền `csm_discount` | **BLOCKER** (Lỗi thiếu `'` làm hỏng khởi tạo DB) | **ĐÃ SỬA** | `infrastructure/docker/mysql/init.sql`<br>Commit: `8f17513` | `logs/evidence/discount_review/review.md` |
| **A.4** | Phân quyền Gateway & Bảo vệ endpoint nội bộ | **BLOCKER** (Customer tạo được voucher 201; claim/release lộ ra ngoài) | **ĐÃ SỬA** | `apps/discount-service/src/discount.controller.ts`<br>`apps/api-gateway/src/proxy.controller.ts`<br>Commit: `a7a21e8` | `logs/evidence/discount_review/voucher_suite_before.log`<br>`logs/evidence/discount_review/voucher_suite_after.log` |
| **B.4a**| Race Condition: 10 request đồng thời khi còn 1 lượt toàn hệ thống | **BLOCKER** (3/10 request thành công, overselling) | **ĐÃ SỬA** | `apps/discount-service/src/discount.service.ts`<br>Commit: `c532601` | `logs/evidence/discount_review/voucher_suite_after.log` |
| **B.4b**| Race Condition: 10 request đồng thời của CÙNG 1 user (`max_per_user=1`) | **BLOCKER** (2/10 request thành công do snapshot MVCC Repeatable Read) | **ĐÃ SỬA** | `apps/discount-service/src/discount.service.ts`<br>Commit: `ff09748` | `logs/evidence/discount_review2/saga_edge_cases_after.log`<br>`logs/evidence/discount_review2/saga_edge_cases_final.log` |
| **B.3a**| Saga Release & Bù trừ: Downstream fail sau claim | **HIGH** (VoucherUsage không được đổi sang REFUNDED nếu thiếu userId; lỗi 404 cho user khi đặt lại) | **ĐÃ SỬA** | `apps/discount-service/src/discount.service.ts`<br>`apps/order-service/src/order.controller.ts`<br>Commit: `ff09748` | `logs/evidence/discount_review2/saga_edge_cases_final.log` |
| **B.3b**| Lỗi 500 khi rollback kho & Fire-and-forget claim | **HIGH** (Lỗi 500 khi voucher lỗi; claim không await) | **ĐÃ SỬA** | `apps/order-service/src/order.controller.ts`<br>Commit: `4f89a5c` | `logs/evidence/discount_review/voucher_suite_after.log` |
| **B.5** | TypeORM Migration trên schema trống và nâng cấp | **HIGH** (Thiếu migration `order-service`, synchronize bật) | **ĐÃ SỬA** | `apps/order-service/src/migrations/1710000000007-AddDiscountColumnsToOrders.ts`<br>`scripts/test-migration.ts`<br>Commit: `76b96f8`, `c5ed483` | `logs/evidence/discount_review2/migration_test.log` (3/3 phần đạt) |
| **A.2 & A.3**| Dockerfile package copy & Workspace npm | **HIGH** (`csm-discount-service` thiếu trong lockfile) | **ĐÃ SỬA** | `apps/discount-service/Dockerfile`<br>`package-lock.json`<br>Commit: `746718d`, `142e19a` | `logs/evidence/discount_review/docker_rebuild_all_fixed.log` |
| **B.6** | Ràng buộc DTO % giảm tối đa và ngày hiệu lực | **MEDIUM** (Cho phép % > 100% hoặc end_date < start_date) | **ĐÃ SỬA** | `apps/discount-service/src/dto/create-voucher.dto.ts`<br>Commit: `8342e1b` | `apps/discount-service/src/discount.spec.ts` |
| **C.1** | Phân quyền Frontend route `/admin/vouchers` | **MEDIUM** (Mở nhầm cho cả `BRANCH_MANAGER`) | **ĐÃ SỬA** | `CSM-FE/src/routes/index.tsx`<br>Commit FE: `39835a7` | `CSM-FE` Playwright |
| **C.2** | Frontend Order Mapper nuốt trường discount & voucher | **HIGH** (FE `orderApi.ts` cắt bỏ `discount_amount`, `voucher_code` làm trang chi tiết đơn không hiển thị) | **ĐÃ SỬA** | `CSM-FE/src/api/orderApi.ts`<br>Commit FE: `c301120` | `logs/evidence/discount_review2/fe_playwright_all_pass.log` |
| **C.3** | Playwright E2E thất bại do sai mật khẩu seed | **HIGH** (2 ca cũ trượt vì dùng `Customer@123456` thay vì `Demo@123456`, dẫn đến 401 redirect `/login`) | **ĐÃ SỬA** | `CSM-FE/tests/e2e.spec.ts`<br>Commit FE: `c301120` | `logs/evidence/discount_review2/fe_playwright_all_pass.log` (11/11 pass) |
| **D.1** | Thiếu kiểm thử tự động `discount-service` | **BLOCKER** (0 file test ban đầu) | **ĐÃ SỬA** | `apps/discount-service/src/discount.spec.ts`<br>Commit: `52d8709`, `ff09748` | `logs/evidence/discount_review2/npm_test_after.log` (20/20 pass) |
| **D.4** | Tài liệu biến môi trường & Volume MySQL cũ | **MEDIUM** (Thiếu `DISCOUNT_SERVICE_URL`, thiếu hướng dẫn tạo `csm_discount` trên volume cũ) | **ĐÃ SỬA** | `README.md`<br>`.env.example`<br>Commit: `8487784` | `README.md`, `.env.example` |
| **D.3** | Chuẩn phân trang `{ items, total, page, limit, totalPages }` | **MEDIUM** | **CHƯA SỬA** | `apps/discount-service/src/discount.controller.ts:16` | Giữ nguyên mảng `[]` để không làm gãy giao diện FE hiện tại của Khánh. |

---

## 2. DANH SÁCH TẤT CẢ CÁC COMMIT THỰC HIỆN TRÊN NHÁNH `integration/discount-review`

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
12. `c5ed483` - `test(discount): expand migration test suite to verify order-service and discount-service on empty and upgraded schemas with DB_SYNC=false`
13. `ff09748` - `fix(discount): lock voucher usages on claim to prevent race condition, support orderId release, and compensate on order failure`
14. `81db5fb` - `test(discount): add saga edge cases suite and cleanup support in test-voucher-suite`
15. `8487784` - `docs(discount): document discount service, env variables, and mysql volume initialization`

### Repo Frontend (CSM-FE):
1. `39835a7` - `fix(discount): restrict admin vouchers route strictly to ADMIN role`
2. `c301120` - `fix(discount): preserve discount and voucher fields in orderApi mapper, add voucher playwright e2e suite`

---

## 3. KẾT QUẢ KIỂM THỬ THỰC TẾ (REAL RUNTIME EVIDENCE)

### A. Kiểm thử Migration TypeORM (`scripts/test-migration.ts` với `DB_SYNC=false`)
* **Mục tiêu:** Chạy kiểm thử độc lập cho cả `order-service` và `discount-service` trên schema trống và schema nâng cấp từ trước voucher.
* **Kết quả:** **3/3 PHẦN PASS HOÀN TOÀN (100%)**
  * **Phần 1 (Order Service - Schema trống):** Chạy tuần tự các migration 4, 5, 6, 7. Kiểm tra đầy đủ các cột mới: `subtotal_amount`, `discount_amount`, `voucher_code`.
  * **Phần 2 (Order Service - Nâng cấp từ schema cũ):** Chạy migration 4, 5, 6 -> Chèn 1 đơn hàng cũ không có trường voucher -> Chạy migration 7 -> Xác minh đơn hàng cũ vẫn nguyên vẹn với `discount_amount = 0.00` và `voucher_code = NULL`.
  * **Phần 3 (Discount Service - Schema trống):** Chạy migration 8 (`1710000000008-CreateDiscountTables`). Xác minh tạo thành công bảng `vouchers` và `voucher_usages`, chèn bản ghi voucher và usage kèm khóa ngoại an toàn.
* **Bằng chứng:** Lưu tại `logs/evidence/discount_review2/migration_test.log`.

### B. Kiểm thử Saga Biên & Concurrency (`scripts/test-saga-edge-cases.js`)
* **Mục tiêu:** Kiểm tra 3 ca biên:
  1. `[SAGA-A]` 10 request đồng thời của CÙNG một user với `max_usage_per_user = 1`.
  2. `[SAGA-B]` Claim thành công nhưng tạo đơn thất bại sau đó -> Lượt dùng có được release không?
  3. `[SAGA-C]` Discount-service phản hồi chậm quá timeout -> Lượt dùng có bị mất không?
* **Kết quả:**
  * **Trước khi fix:**
    * SAGA-A phát hiện **LỖ HỔNG CONCURRENCY**: 2/10 request của cùng 1 user thành công do snapshot cách ly MVCC REPEATABLE READ trong MySQL.
    * SAGA-B thất bại do hàm `releaseVoucher` yêu cầu bắt buộc cả `userId && orderId`. Khi downstream chỉ truyền `orderId`, lượt dùng không được giải phóng.
  * **Sau khi fix (Commit `ff09748`):** **3/3 CA ĐẠT TUYỆT ĐỐI (100%)**
    * `[SAGA-A]`: Đúng DUY NHẤT 1 request thành công, 9 request bị chặn 400 Bad Request.
    * `[SAGA-B]`: Release thành công, `VoucherUsage` chuyển sang `REFUNDED`, `used_count` giảm, tính Idempotent khi gọi lặp lại an toàn.
    * `[SAGA-C]`: Đơn hàng huỷ giải phóng voucher hoàn tất, voucher không bị mất lượt dùng.
* **Bằng chứng:** Lưu tại `logs/evidence/discount_review2/saga_edge_cases_final.log`.

### C. Kiểm thử E2E Voucher Chuyên Sâu (`scripts/test-voucher-suite.js --cleanup`)
* **Kết quả:** **9/9 CA PASS (100%)**
  * `[CA 1]`: Admin tạo voucher (201 Created).
  * `[CA 2]`: Customer bị chặn tạo voucher (403 Forbidden).
  * `[CA 3.1 - 3.3]`: Validate voucher hợp lệ (20.000đ), dưới min_order_value (400), mã sai (404).
  * `[CA 4]`: Đặt đơn có voucher, server tính đúng tổng tiền.
  * `[CA 5]`: Đặt lần 2 vượt giới hạn user bị chặn 400.
  * `[CA 6]`: 10 request đồng thời với voucher còn 1 lượt toàn hệ thống -> Duy nhất 1 đơn thành công.
  * `[CA 7]`: Huỷ đơn hàng hoàn lại lượt dùng cho user.
  * **Dọn dẹp (--cleanup):** Tự động xoá toàn bộ đơn hàng, voucher và người dùng kiểm thử.
* **Bằng chứng:** Lưu tại `logs/evidence/discount_review2/voucher_suite_final.log`.

### D. Kiểm thử Jest Unit Tests (`npm test apps/discount-service`)
* **Kết quả:** **20/20 TESTS PASS (100%)** trong 9.5s.
* **Bằng chứng:** Lưu tại `logs/evidence/discount_review2/npm_test_after.log`.

### E. Kiểm thử Frontend Playwright E2E (`npx playwright test` tại `CSM-FE`)
* **Kết quả:** **11/11 TESTS PASS (100%)** trên 3 file kiểm thử:
  * `tests/e2e.spec.ts`: 6/6 pass (Đã giải quyết triệt để 2 ca trượt trước đó).
  * `tests/mapper.spec.ts`: 2/2 pass.
  * `tests/voucher.spec.ts` (Bộ kiểm thử voucher mới): 3/3 pass:
    1. *Admin tạo voucher thành công qua giao diện `/admin/vouchers`.*
    2. *Customer chọn và áp dụng voucher tại Giỏ hàng / Thanh toán, đặt đơn COD, kiểm tra số tiền hiển thị khớp chính xác số tiền server tính.*
    3. *Branch Manager bị chặn không vào được `/admin/vouchers` (tự động chuyển hướng về `/unauthorized`).*
* **Nguyên nhân thực tế của 2 ca trượt trước đó:**
  * File test `tests/e2e.spec.ts` sử dụng mật khẩu fallback là `Customer@123456` và `Manager@123456`. Trong khi đó, file nạp dữ liệu `scripts/seed-data.ts` khởi tạo toàn bộ tài khoản với mật khẩu `Demo@123456`. Khi đăng nhập, Auth Service từ chối với `401 Unauthorized` (`Email hoặc mật khẩu không chính xác`). `ProtectedRoute` lập tức chuyển hướng người dùng chưa đăng nhập về `/login`. Do đó, Test 3 mong đợi URL `/unauthorized/` nhưng nhận được `/login`; Test 4 tìm kiếm text `Khoá chi nhánh: br-01` trên trang `/login` nên bị timeout.
* **Bằng chứng:** Lưu tại `logs/evidence/discount_review2/fe_playwright_all_pass.log`.

### F. Kiểm thử Nhánh Frontend & Xung đột Merging
* Nhánh `fix/products-paginated-contract`: ĐÃ ĐƯỢC CHỨA trong nhánh tích hợp FE (thông qua merge commit `80861f9`).
* Nhánh `feature/admin-ux-polish`: Chưa được merge. Thử nghiệm dry-run merge phát hiện xung đột tại `src/layouts/AdminLayout.tsx` và `src/modules/orders/pages/OrderListPage.tsx`. Đã thực hiện `git merge --abort` để bảo toàn trạng thái theo đúng chỉ thị.
* **Bằng chứng:** Lưu tại `logs/evidence/discount_review2/fe_branch_check.log`.

### G. Nạp Dữ Liệu Demo Seed (`npm run seed:demo`)
* Chạy thành công, bảo toàn tính Idempotent.
* Số lượng bản ghi sau kiểm thử và dọn dẹp:
  * `csm_auth.users`: 37 tài khoản.
  * `csm_inventory.branches`: 3 chi nhánh; `stocks`: 78 bản ghi.
  * `csm_product.categories`: 5 danh mục; `products`: 26 sản phẩm.
  * `csm_order.orders`: 259 đơn hàng.
  * `csm_discount.vouchers`: 25 voucher; `voucher_usages`: 19 bản ghi.
* **Bằng chứng:** Lưu tại `logs/evidence/discount_review2/seed_verification.log`.

---

## 4. CÁC NỘI DUNG CHƯA KIỂM CHỨNG & LƯU Ý CHO NGUYỄN KHÁNH

1. **Nhánh `feature/admin-ux-polish` (FE):**
   * Tồn tại xung đột về giao diện Admin Layout và Order List giữa chuỗi Voucher và nhánh polish UX. Nhánh này cần do tác giả FE chủ động rebase/merge sau khi hoàn tất tích hợp voucher.
2. **Chuẩn phân trang danh sách Voucher:**
   * Endpoint `GET /vouchers?all=true` hiện trả về mảng trực tiếp `Voucher[]`. Khuyến nghị Khánh trong tương lai cập nhật sang format chuẩn `{ items, total, page, limit, totalPages }` để đồng bộ toàn dự án.
3. **Volume MySQL đã tồn tại trên máy phát triển:**
   * Đối với các thành viên đã chạy Docker Compose từ trước, Docker volume `csm-be_mysql_data` sẽ không tự chạy lại `init.sql`. Cần thực hiện lệnh tạo database thủ công như đã nêu trong `README.md`:
   ```bash
   docker compose exec mysql mysql -uroot -prootpassword -e "CREATE DATABASE IF NOT EXISTS csm_discount CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL PRIVILEGES ON csm_discount.* TO 'root'@'%'; FLUSH PRIVILEGES;"
   ```

---

## 5. THAO TÁC GHI / XOÁ DỮ LIỆU DATABASE TRONG QUÁ TRÌNH KIỂM THỬ

* Tạo và xoá tạm thời 3 người dùng kiểm thử (`cust_voucher_*`, `saga_user_*`).
* Tạo và xoá tạm thời 5 mã voucher kiểm thử (`TEST_VOUCHER_*`, `CONCURRENT_*`, `SAGA_SAME_*`, `SAGA_RB_*`, `SAGA_TO_*`) cùng các bản ghi `voucher_usages` tương ứng.
* Tạo và xoá tạm thời 4 đơn hàng kiểm thử trong `csm_order.orders` và `csm_order.order_items`.
* Tạo và drop hoàn toàn 3 database test tạm: `csm_order_empty_test`, `csm_order_upgrade_test`, `csm_discount_empty_test`.
* Tất cả dữ liệu thử nghiệm đều đã được dọn dẹp triệt để thông qua cơ chế `--cleanup`. Dữ liệu hệ thống đã được xác nhận bằng `npm run seed:demo`.

---

## 6. KẾT LUẬN CUỐI CÙNG

* **Đánh giá mức độ sẵn sàng:**
  * Toàn bộ 4 lỗi **BLOCKER** và các lỗi **HIGH** ban đầu đã được giải quyết và kiểm chứng bằng test thực tế trên cả hai repo `CSM-BE` và `CSM-FE`.
  * Không còn bất kỳ lỗi BLOCKER hay lỗi hồi quy nào đang mở.
  * Các kiểm thử tự động (Jest 20/20, Playwright 11/11, Migration 3/3, Saga Concurrency 3/3, Voucher Suite 9/9) đều đạt tỷ lệ **100% PASS**.
* **Khuyến nghị:**
  * Nhánh `integration/discount-review` trên cả BE và FE **ĐỦ ĐIỀU KIỆN KỸ THUẬT** để tạo Pull Request merge vào `origin/dev`.
  * KHÔNG merge trực tiếp vào `main` cho đến khi nhánh `dev` được kiểm thử tích hợp toàn diện cùng các thành viên khác.
