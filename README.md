# Hệ Thống Microservices CSM (Convenience Store Management)

Hệ thống Backend Microservices phục vụ chuỗi cửa hàng tiện lợi CSM được xây dựng trên nền tảng **NestJS**, **TypeORM**, **MySQL**, **Docker Compose** và **React Frontend**.

---

## 🏗️ 1. Kiến Trúc Hệ Thống (Architecture)

Hệ thống được thiết kế theo kiến trúc Microservices phân tán gồm 7 dịch vụ backend, 1 cổng kết nối tập trung, cơ sở dữ liệu đa schema MySQL và ứng dụng web frontend:

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
   └── Notification Service (Port 3006)   -> Mô phỏng gửi email / SMS / Push in-memory
```

### Chi tiết các dịch vụ:
1. **API Gateway (Port 8000):** Cổng giao tiếp trung tâm duy nhất mở ra bên ngoài. Chịu trách nhiệm reverse-proxy, xác thực JWT tập trung, gán headers định danh nội bộ (`x-user-id`, `x-user-role`, `x-branch-id`), ngăn chặn header spoofing từ client và tích hợp tài liệu **Swagger UI**.
2. **Auth Service (Port 3001):** Quản lý tài khoản, phân quyền RBAC (`ADMIN`, `BRANCH_MANAGER`, `STAFF`, `CUSTOMER`), cấp phát Access Token (15m) & Refresh Token (7d) an toàn. Sử dụng thư viện `bcryptjs` thuần JavaScript giúp tối ưu tốc độ build Docker và tương thích ngược với hash `$2b$`.
3. **Product Service (Port 3002):** Quản lý danh mục sản phẩm (Category) và danh mục hàng hoá (Product Catalog).
4. **Inventory Service (Port 3003):** Quản lý mạng lưới chi nhánh cửa hàng (tính khoảng cách GPS theo công thức Haversine, xoá mềm an toàn từ chối 409 nếu còn kho/đơn hàng), quản lý tồn kho đa chi nhánh và sổ biến động kho (`StockTransaction`). Thực thi các bước Saga kho hàng: Giữ kho (`reserve-stock`), trừ kho (`confirm-deduct`), hoàn kho (`release-stock`) với cơ chế Idempotency & khóa bi quan (`pessimistic_write`).
5. **Order Service (Port 3004):** Điều phối đặt hàng (Saga Orchestration với cơ chế bù trừ tự động), quản lý máy trạng thái đơn hàng (`PENDING` -> `CONFIRMED` -> `PAID` -> `SHIPPED` / `CANCELLED`), truy vấn và lọc đơn hàng đa tiêu chí theo phân quyền chi nhánh.
6. **Payment Service (Port 3005 - Mô phỏng):** Mô phỏng cổng thanh toán trực tuyến bảo mật (MoMo, ATM VNPay), cấp token ký số JWT thời hạn 10 phút, hỗ trợ Idempotency khi thanh toán lặp lại.
7. **Notification Service (Port 3006 - Mô phỏng):** Nhận webhook sự kiện (`order_created`, trạng thái thanh toán) và xử lý in-memory.
8. **Frontend (Port 3000):** Ứng dụng Web SPA xây dựng bằng React 18, Vite, TailwindCSS, Zustand và Radix UI.

---

## ⚡ 2. Khởi Chạy Toàn Hệ Thống Bằng Một Lệnh (Single-Command Docker Compose)

Toàn bộ hệ thống (gồm MySQL, 7 Microservices Backend và Frontend) được cấu hình khởi chạy hoàn toàn tự động bằng một lệnh duy nhất:

### Bước 1: Tạo file cấu hình môi trường
```bash
# Tại thư mục gốc CSM-BE
cp .env.example .env
```

### Bước 2: Khởi động toàn bộ stack
```bash
docker compose up -d --build
```
> **Tối ưu Docker Build:** Các Dockerfile đã được tối ưu hoá thứ tự COPY file manifests (`package*.json` gốc và của từng workspace) cùng cờ cache mount `RUN --mount=type=cache,target=/root/.npm npm ci`. Khi chỉ thay đổi mã nguồn, bước `npm ci` được tái sử dụng từ cache layer (`CACHED`), giúp thời gian build chỉ mất vài giây.

Kiểm tra trạng thái sẵn sàng của toàn bộ container:
```bash
docker compose ps
```
*(Chờ các service chuyển sang trạng thái `healthy` qua Docker healthchecks tích hợp).*

---

## 🔑 3. Danh Sách Biến Môi Trường (`.env.example`)

Bảng dưới đây mô tả chi tiết các biến cấu hình trong `.env`:

| Tên biến | Giá trị mẫu | Mục đích & Ý nghĩa |
| :--- | :--- | :--- |
| `NODE_ENV` | `development` / `production` | Môi trường chạy hệ thống (dev kích hoạt Swagger docs) |
| `PORT` | `8000` | Cổng lắng nghe chính của API Gateway |
| `AUTH_DB_URL` | `mysql://root:rootpassword@mysql:3306/csm_auth` | Chuỗi kết nối Database MySQL cho Auth Service |
| `PRODUCT_DB_URL` | `mysql://root:rootpassword@mysql:3306/csm_product` | Chuỗi kết nối Database MySQL cho Product Service |
| `INVENTORY_DB_URL` | `mysql://root:rootpassword@mysql:3306/csm_inventory` | Chuỗi kết nối Database MySQL cho Inventory Service |
| `ORDER_DB_URL` | `mysql://root:rootpassword@mysql:3306/csm_order` | Chuỗi kết nối Database MySQL cho Order Service |
| `JWT_SECRET` | Khóa bí mật min 32 ký tự | Khóa bí mật dùng để ký và xác thực Access Token JWT |
| `JWT_REFRESH_SECRET` | Khóa bí mật min 32 ký tự | Khóa bí mật dùng để ký và xác thực Refresh Token JWT |
| `INTERNAL_SECRET` | Khóa bí mật nội bộ | Khóa bảo mật giao tiếp nội bộ giữa các microservices |
| `AUTH_SERVICE_URL` | `http://auth-service:3001` | URL nội bộ của Auth Service cho API Gateway |
| `PRODUCT_SERVICE_URL` | `http://product-service:3002` | URL nội bộ của Product Service cho API Gateway |
| `INVENTORY_SERVICE_URL` | `http://inventory-service:3003` | URL nội bộ của Inventory Service cho API Gateway |
| `ORDER_SERVICE_URL` | `http://order-service:3004` | URL nội bộ của Order Service cho API Gateway |
| `PAYMENT_SERVICE_URL` | `http://payment-service:3005` | URL nội bộ của Payment Service cho API Gateway |
| `NOTIFICATION_SERVICE_URL` | `http://notification-service:3006` | URL nội bộ của Notification Service cho API Gateway |
| `PAYMENT_SIMULATION` | `true` | Cờ kích hoạt/vô hiệu tính năng mô phỏng thanh toán trực tuyến |
| `PAYMENT_SIMULATION_SECRET`| Khóa bí mật ký token thanh toán | Khóa ký số token JWT cho link mô phỏng thanh toán 10 phút |
| `PUBLIC_GATEWAY_URL` | `http://localhost:8000` | URL công khai của API Gateway dùng cho redirect thanh toán |
| `FRONTEND_URL` | `http://localhost:3000` | URL của Web Frontend client |

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
