# Hệ Thống Microservices CSM (Convenience Store Management)

Hệ thống Backend Microservices phục vụ chuỗi cửa hàng tiện lợi CSM được xây dựng trên nền tảng NestJS, TypeORM, MySQL và React Frontend.

---

## 🏗️ Kiến Trúc Hệ Thống (7 Microservices Backend + Frontend)

1. **API Gateway (Port 8000):** Cổng giao tiếp trung tâm, định tuyến reverse-proxy, xác thực JWT tập trung, gán headers định danh nội bộ (`x-user-id`, `x-user-role`, `x-branch-id`), ngăn chặn header spoofing từ client.
2. **Auth Service (Port 3001):** Quản lý người dùng, phân quyền RBAC (`ADMIN`, `BRANCH_MANAGER`, `STAFF`, `CUSTOMER`), cấp phát Access Token (15m) & Refresh Token (7d) an toàn.
3. **Product Service (Port 3002):** Quản lý danh mục và sản phẩm (Catalog).
4. **Inventory Service (Port 3003):** Quản lý mạng lưới chi nhánh (tìm kiếm theo toạ độ Haversine, xoá mềm), quản lý tồn kho và giao dịch kho (`StockTransaction`). Thực thi các bước Saga kho hàng: Giữ kho (`reserve-stock`), trừ kho (`confirm-deduct`), hoàn kho (`release-stock`) với cơ chế Idempotency & khóa bi quan (pessimistic lock).
5. **Order Service (Port 3004):** Điều phối đặt hàng, máy trạng thái đơn hàng (`PENDING` -> `CONFIRMED` -> `PAID` -> `SHIPPED` / `CANCELLED`), Saga Orchestration với rollback bù trừ tự động khi gặp lỗi.
6. **Payment Service (Port 3005):** Giả lập cổng thanh toán trực tuyến (MoMo, VNPAY ATM).
7. **Notification Service (Port 3006):** 
   > ⚠️ **GHI CHÚ MÔ PHỎNG (C3 Specification):** Notification Service hiện hoạt động theo cơ chế **MÔ PHỎNG (Simulation)** nhận sự kiện webhook và xử lý in-memory thay vì kết nối cụm RabbitMQ/Kafka thực tế nhằm tinh gọn tài nguyên phát triển và kiểm thử.
8. **Frontend (Port 3000):** React 18, Vite, TailwindCSS, Zustand, Radix UI.

---

## 🚀 Hướng Dẫn Khởi Chạy Toàn Hệ Thống Bằng Docker Compose (Trên Máy Sạch)

### Bước 1: Chuẩn bị file môi trường
```bash
# Tại thư mục CSM-BE
cp .env.example .env
```
*(Nếu dùng database local trong container, các biến `AUTH_DB_URL`, `PRODUCT_DB_URL`, `INVENTORY_DB_URL`, `ORDER_DB_URL` đã được cấu hình mặc định trỏ về container MySQL `csm-mysql`).*

### Bước 2: Khởi động toàn bộ 7 services BE + FE + MySQL bằng một lệnh
```bash
docker compose up -d --build
```
Kiểm tra trạng thái container và healthcheck:
```bash
docker compose ps
```

### Bước 3: Nạp dữ liệu mẫu (Seed Data)
Sau khi container MySQL và các services đã healthy:
```bash
# Cách 1: Chạy trực tiếp từ host
npm run seed

# Hoặc Cách 2: Chạy bên trong container api-gateway
docker compose exec api-gateway npm run seed
```

### Bước 4: Truy cập ứng dụng
- **Web Frontend:** [http://localhost:3000](http://localhost:3000)
- **API Gateway:** [http://localhost:8000/api/v1](http://localhost:8000/api/v1)
- **Tài khoản mặc định đã seed:**
  - `admin@csm.vn` / `Password123!` (ADMIN)
  - `manager.q1@csm.vn` / `Password123!` (BRANCH_MANAGER chi nhánh Quận 1 `br-01`)
  - `staff.q1@csm.vn` / `Password123!` (STAFF chi nhánh Quận 1 `br-01`)
  - `customer@csm.vn` / `Password123!` (CUSTOMER)

---

## 💻 Hướng Dẫn Chạy Môi Trường Local Dev (Không Cần Docker)

### Khởi động đồng thời 7 backend services:
```bash
npm run start:all
```
Script này khởi chạy song song:
- `npm run start:gateway` (port 8000)
- `npm run start:auth` (port 3001)
- `npm run start:product` (port 3002)
- `npm run start:inventory` (port 3003)
- `npm run start:order` (port 3004)
- `npm run start:payment` (port 3005)
- `npm run start:notification` (port 3006)

### Khởi động Frontend:
```bash
cd ../CSM-FE
npm run dev
```

---

## 🧪 Kiểm Thử & Tự Động Hóa (Tests)

### Chạy bộ kiểm thử E2E tích hợp:
```bash
# Kiểm thử toàn diện 20 ca và tự động assert PASS/FAIL:
node scripts/test-e2e.js

# Dọn dẹp triệt để dữ liệu sau test:
node scripts/test-e2e.js --cleanup
```

### Chạy Unit & Integration Tests (Jest):
```bash
npm test
```
