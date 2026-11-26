# Hệ Thống Microservices CSM (Convenience Store Management)

Hệ thống Backend Microservices phục vụ chuỗi cửa hàng tiện lợi CSM được xây dựng trên nền tảng **NestJS**, **TypeORM**, **MySQL**, **Docker Compose** và **React Frontend**.

---

## 🏗️ 1. Kiến Trúc Hệ Thống (Architecture)

Hệ thống được thiết kế theo kiến trúc Microservices phân tán gồm 8 dịch vụ backend, 1 cổng kết nối tập trung, cơ sở dữ liệu đa schema MySQL và ứng dụng web frontend:

```
[ Khách hàng / Quản trị viên ]
             │
             ▼
   [ Frontend (Port 3000) ]
             │
             ▼
[ API Gateway (Port 8000) - Định tuyến, Xác thực JWT, Chống Spoofing, Swagger Docs ]
   ├── Auth Service (Port 3001)           -> csm_auth (RBAC, JWT Access & Refresh, bcryptjs)
   ├── Product Service (Port 3002)        -> csm_product (Catalog, Categories, Products)
   ├── Inventory Service (Port 3003)      -> csm_inventory (Branches, GPS Haversine, Pessimistic Stock, Saga)
   ├── Order Service (Port 3004)          -> csm_order (Saga Orchestration, State Machine, Phân quyền đơn)
   ├── Payment Service (Port 3005)        -> Mô phỏng cổng thanh toán (MoMo, ATM VNPay, JWT signed)
   ├── Notification Service (Port 3006)   -> Mô phỏng gửi email / SMS / Push in-memory
   └── Discount Service (Port 3007)       -> csm_discount (CRUD Voucher, Validate, Claim/Release Saga, Pessimistic Lock)
```

### Chi tiết các dịch vụ:
1. **API Gateway (Port 8000):** Cổng giao tiếp trung tâm duy nhất mở ra bên ngoài. Chịu trách nhiệm reverse-proxy, xác thực JWT tập trung, gán headers định danh nội bộ (`x-user-id`, `x-user-role`, `x-branch-id`), ngăn chặn header spoofing từ client và tích hợp tài liệu **Swagger UI**.
2. **Auth Service (Port 3001):** Quản lý tài khoản, phân quyền RBAC (`ADMIN`, `BRANCH_MANAGER`, `STAFF`, `CUSTOMER`), cấp phát Access Token (15m) & Refresh Token (7d) an toàn. Sử dụng thư viện `bcryptjs` thuần JavaScript giúp tối ưu tốc độ build Docker và tương thích ngược với hash `$2b$`.
3. **Product Service (Port 3002):** Quản lý danh mục sản phẩm (Category) và danh mục hàng hoá (Product Catalog).
4. **Inventory Service (Port 3003):** Quản lý mạng lưới chi nhánh cửa hàng (tính khoảng cách GPS theo công thức Haversine, xoá mềm an toàn từ chối 409 nếu còn kho/đơn hàng), quản lý tồn kho đa chi nhánh và sổ biến động kho (`StockTransaction`). Thực thi các bước Saga kho hàng: Giữ kho (`reserve-stock`), trừ kho (`confirm-deduct`), hoàn kho (`release-stock`) với cơ chế Idempotency & khóa bi quan (`pessimistic_write`).
5. **Order Service (Port 3004):** Điều phối đặt hàng (Saga Orchestration với cơ chế bù trừ tự động), quản lý máy trạng thái đơn hàng (`PENDING` -> `CONFIRMED` -> `PAID` -> `SHIPPED` / `CANCELLED`), truy vấn và lọc đơn hàng đa tiêu chí theo phân quyền chi nhánh.
6. **Payment Service (Port 3005 - Mô phỏng):** Mô phỏng cổng thanh toán trực tuyến bảo mật (MoMo, ATM VNPay), cấp token ký số JWT thời hạn 10 phút, hỗ trợ Idempotency khi thanh toán lặp lại.
7. **Notification Service (Port 3006 - Mô phỏng):** Nhận webhook sự kiện (`order_created`, trạng thái thanh toán) và xử lý in-memory.
8. **Discount Service (Port 3007):** Quản lý mã giảm giá / khuyến mãi (`Voucher`), kiểm tra điều kiện áp dụng phía máy chủ, xác thực giới hạn lượt dùng toàn hệ thống và theo người dùng, tham gia chuỗi Saga đặt hàng với cơ chế giữ lượt (`claim`) và hoàn lượt (`release`) bằng khóa bi quan chống tranh chấp tài nguyên.
9. **Frontend (Port 3000):** Ứng dụng Web SPA xây dựng bằng React 18, Vite, TailwindCSS, Zustand và Radix UI.

---

## ⚡ 2. Khởi Chạy Toàn Hệ Thống Bằng Một Lệnh (Single-Command Docker Compose)

Toàn bộ hệ thống (gồm MySQL, 7 Microservices Backend và Frontend) được cấu hình khởi chạy hoàn toàn tự động bằng một lệnh duy nhất:

### Bước 1: Tạo file cấu hình môi trường
```bash
# Cách 1 (Khuyến nghị): Tự động tạo .env từ .env.example và sinh secret ngẫu nhiên
npm run env:init

# Cách 2: Sao chép thủ công rồi tự điền các giá trị CHANGE_ME_*
cp .env.example .env

# Kiểm tra cấu hình hợp lệ (không in giá trị secret)
npm run env:check
```

### Bước 2: Khởi động toàn bộ stack
```bash
docker compose up -d --build
```
> **Lưu ý khi build nhiều service trên máy yếu / Windows:** Để tránh Docker build song song quá tải CPU/RAM, đặt giới hạn tuần tự trước khi chạy `docker compose build` / `up`:
> - **PowerShell:** `$env:COMPOSE_PARALLEL_LIMIT=1`
> - **CMD:** `set COMPOSE_PARALLEL_LIMIT=1`
>
> **Tối ưu Docker Build:** Các Dockerfile đã được tối ưu hoá thứ tự COPY file manifests (`package*.json` gốc và của từng workspace) cùng cờ cache mount `RUN --mount=type=cache,target=/root/.npm npm ci`. Khi chỉ thay đổi mã nguồn, bước `npm ci` được tái sử dụng từ cache layer (`CACHED`), giúp thời gian build chỉ mất vài giây.

Kiểm tra trạng thái sẵn sàng của toàn bộ container:
```bash
docker compose ps
```
*(Chờ các service chuyển sang trạng thái `healthy` qua Docker healthchecks tích hợp).*

---

## 🔑 3. Cấu Hình Môi Trường

> **Quy tắc bảo mật:** **Không commit `.env` / `.env.cloud` lên Git, không dán nội dung `.env` lên chat hay issue.** Các service NestJS sẽ tự động dừng (fail-fast) khi khởi động nếu thiếu biến bắt buộc hoặc secret dưới 32 ký tự.

### 3.1. Các nhóm biến trong `.env.example`
1. **Chung:** `NODE_ENV`, các cổng (`PORT`, `AUTH_PORT`, `PRODUCT_PORT`, `INVENTORY_PORT`, `ORDER_PORT`, `PAYMENT_PORT`, `NOTIFICATION_PORT`, `DISCOUNT_PORT`), `UPLOAD_DIR`.
2. **MySQL & Chuỗi kết nối:** `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD`, cùng `AUTH_DB_URL`, `PRODUCT_DB_URL`, `INVENTORY_DB_URL`, `ORDER_DB_URL`, `DISCOUNT_DB_URL`. (Với cloud/SSL, xem `.env.cloud.example` — **tuyệt đối không dùng chung secret với local** và **không chạy `seed --reset`**).
3. **JWT & Bảo mật nội bộ (tối thiểu 32 ký tự):** `JWT_SECRET`, `JWT_REFRESH_SECRET`, `INTERNAL_SECRET`.
4. **URL các service:** `*_SERVICE_URL`, `PUBLIC_GATEWAY_URL`, `API_GATEWAY_URL`, `FRONTEND_URL`.
5. **Discount & Thanh toán mô phỏng:** `DISCOUNT_SERVICE_URL`, `PAYMENT_SIMULATION_SECRET`.
6. **Biến chỉ dùng cho test / cờ nguy hiểm (mặc định `false`):**
   - `DB_SYNC`: chỉ bật `true` ở local dev lần đầu để TypeORM tạo bảng; tắt `false` trên production.
   - `ENABLE_SWAGGER`: chỉ bật `true` ở local dev/staging; tắt `false` trên production.
   - `PAYMENT_SIMULATION`: chỉ bật `true` ở môi trường demo/test; tắt `false` trên production.
   - `ENABLE_TEST_DELAY`: chỉ bật `true` khi chạy test Saga timeout 5s.
   - `SEED_PASSWORD`, `TEST_API_URL`, `TEST_CLEANUP`, `TEST_*_DB_URL`: chỉ dùng cho seed/test.

### 3.2. Cách xoay vòng (Rotate) Secret
1. Sinh chuỗi ngẫu nhiên mới (>= 32 ký tự, ví dụ: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
2. Cập nhật biến tương ứng (`JWT_SECRET`, `JWT_REFRESH_SECRET`, `INTERNAL_SECRET`, `PAYMENT_SIMULATION_SECRET`) trong `.env` / `.env.cloud`.
3. Khởi động lại các container liên quan (`docker compose up -d --force-recreate`). Lưu ý: đổi `JWT_SECRET` sẽ làm các access token cũ hết hiệu lực.

### 3.3. Cảnh báo quan trọng về Docker Volume MySQL
- **Mật khẩu root MySQL (`MYSQL_ROOT_PASSWORD`) chỉ có hiệu lực ở lần đầu tiên tạo volume `mysql_data`.** Việc đổi `MYSQL_ROOT_PASSWORD` trong `.env` sau đó **không** tự đổi mật khẩu của MySQL đã lưu trong volume.
  - Cách xử lý khi cần đổi mật khẩu trên volume đang có dữ liệu:
    ```bash
    docker compose exec mysql mysql -uroot -p -e "ALTER USER 'root'@'%' IDENTIFIED BY '<NEW_PASSWORD>'; ALTER USER 'root'@'localhost' IDENTIFIED BY '<NEW_PASSWORD>'; FLUSH PRIVILEGES;"
    ```
  - Nếu chỉ là dữ liệu demo và muốn tạo lại volume sạch từ đầu:
    ```bash
    docker compose down -v && docker compose up -d
    ```
- **Lưu ý với volume đã tồn tại thiếu database `csm_discount`:** File `init.sql` chỉ chạy lần đầu tạo volume. Nếu volume cũ chưa có `csm_discount`, tạo thủ công mà không mất dữ liệu cũ:
  ```bash
  docker compose exec mysql mysql -uroot -p -e "CREATE DATABASE IF NOT EXISTS csm_discount CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL PRIVILEGES ON csm_discount.* TO 'root'@'%'; FLUSH PRIVILEGES;"
  ```

---

## 📦 4. Nạp Dữ Liệu Mẫu (Seed Data)

Nạp tài khoản người dùng mẫu, chi nhánh cửa hàng, danh mục sản phẩm và tồn kho ban đầu:

```bash
# Cách 1: Chạy trực tiếp từ môi trường host
npm run seed

# Cách 2: Chạy trực tiếp bên trong container api-gateway
docker compose exec api-gateway npm run seed
```

### Các tài khoản mặc định sau khi seed:
| Email đăng nhập | Mật khẩu | Vai trò (Role) | Phân công chi nhánh |
| :--- | :--- | :--- | :--- |
| `admin@csm.vn` | `Admin@123456` | **ADMIN** | Toàn quyền toàn hệ thống |
| `manager.q1@csm.vn` | `Manager@123456` | **BRANCH_MANAGER** | Quản lý chi nhánh Quận 1 (`br-01`) |
| `customer@csm.vn` | `Customer@123456` | **CUSTOMER** | Khách hàng mua sắm |

---

## 📑 5. Tài Liệu API & Swagger Documentation

- **Swagger UI Interactive Docs:** [http://localhost:8000/docs](http://localhost:8000/docs) (hoặc [http://localhost:8000/api/v1/docs](http://localhost:8000/api/v1/docs))  
  *(Chỉ kích hoạt trong môi trường `NODE_ENV !== 'production'` hoặc `ENABLE_SWAGGER=true`).*
- **OpenAPI 3.0 JSON Specification:** [http://localhost:8000/docs-json](http://localhost:8000/docs-json)
- **Tài liệu đặc tả chi tiết phân quyền & endpoints:** Xem tài liệu [docs/api-endpoints.md](docs/api-endpoints.md).

---

## 🧪 6. Kiểm Thử & Đo Lường Hiệu Năng (Test / E2E / Benchmark)

### 6.1 Chạy Unit Tests (Jest)
Kiểm tra toàn bộ 8 test suites bao gồm State Machine, Saga Orchestration, Pessimistic Locking Concurrency, Idempotency và tương thích hash bcrypt `$2b$`:
```bash
npm test
```

### 6.2 Chạy Bộ Kiểm Thử Tích Hợp Toàn Diện E2E
Chạy bộ kiểm thử 97 kịch bản E2E kiểm tra toàn bộ luồng nghiệp vụ end-to-end qua API Gateway, kèm cờ tự động dọn sạch dữ liệu test:
```bash
node scripts/test-e2e.js --cleanup
```

### 6.3 Chạy Bộ Đo Lường Hiệu Năng & Chịu Tải (Benchmark - CSM-42)

#### Cách 1: Chạy trực tiếp bằng Benchmark Runner tự động (Node.js Engine):
Đo đạc kịch bản đọc, kịch bản ghi 10/50/100 người dùng đồng thời trên cùng sản phẩm, kiểm chứng không bán vượt tồn và tự động hoàn trả tồn kho:
```bash
node scripts/benchmark/benchmark.js
```
Kết quả được tự động tổng hợp và xuất ra file [docs/benchmark-results.md](docs/benchmark-results.md).

#### Cách 2: Chạy k6 thông qua Docker Image `grafana/k6`:
```bash
# Đo lường kịch bản đọc (GET /products, GET /branches/nearest, GET /inventory/product/:id):
Get-Content scripts/benchmark/k6-read.js | docker run --rm -i --network csm-be_csm-network grafana/k6 run -

# Đo lường kịch bản ghi POST /orders (COD) với k6:
Get-Content scripts/benchmark/k6-write.js | docker run --rm -i --network csm-be_csm-network grafana/k6 run -
```

---

## ⚠️ 7. Các Hạn Chế Đã Biết (Known Limitations)

1. **Notification Service là Mô Phỏng (Simulation):**
   - Hệ thống hiện tại ghi nhận và mô phỏng các sự kiện thông báo (in-memory event logging) thay vì tích hợp cụm RabbitMQ/Kafka thật nhằm tối ưu tài nguyên phát triển và kiểm thử nội bộ.
2. **Cổng Thanh Toán Trực Tuyến là Mô Phỏng Bảo Mật:**
   - Dịch vụ Payment Service sử dụng cơ chế mô phỏng an toàn với token ký số JWT thời hạn 10 phút để người dùng thử nghiệm quy trình thanh toán MoMo / ATM VNPay mà không kết nối với cổng ngân hàng thương mại thật.
   - Khi triển khai môi trường Production thực tế, cờ `PAYMENT_SIMULATION` cần được đặt là `false` để kết nối với Webhook / IPN chính thức từ cổng thanh toán đối tác.
