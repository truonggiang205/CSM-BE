# ⚙️ CSM-BE (Convenience Store Management - Backend Microservices)

Hệ thống Backend Microservices cho chuỗi cửa hàng tiện lợi CSM phục vụ đề tài Tiểu luận chuyên ngành (TLCN).

---

## 🏛️ Kiến Trúc Hệ Thống & Cổng Dịch Vụ (Ports)

| Tên Service | Thư mục | Cổng (Port) | Cơ sở dữ liệu | Vai trò |
| :--- | :--- | :---: | :--- | :--- |
| **API Gateway** | `gateway/` | **8000** | - | Reverse Proxy, định tuyến request, xác thực JWT |
| **Auth Service** | `services/auth-service/` | **3001** | `db_auth` | Đăng ký, đăng nhập, phân quyền RBAC |
| **Product Service** | `services/product-service/`| **3002** | `db_product` | Quản lý danh mục, sản phẩm và chuỗi chi nhánh |
| **Inventory Service**| `services/inventory-service/`| **3003** | `db_inventory`| Quản lý tồn kho chi nhánh, API kiểm tra & trừ kho |
| **Order Service** | `services/order-service/` | **3004** | `db_order` | Đặt hàng, giao tiếp liên service gọi Inventory trừ kho |
| **MySQL Cluster** | Docker container | **3306** | 4 DBs | MySQL 8.0 chứa 4 schema độc lập |
| **phpMyAdmin** | Docker container | **8080** | - | Giao diện quản lý CSDL trực quan trên trình duyệt |

---

## 🚀 Hướng Dẫn Khởi Chạy Nhanh

### Bước 1: Khởi chạy cụm Cơ sở dữ liệu MySQL bằng Docker
Mở terminal tại thư mục `CSM-BE` và chạy:
```bash
docker compose up -d
```
- Cơ sở dữ liệu sẽ tự động tạo sẵn 4 database: `db_auth`, `db_product`, `db_inventory`, `db_order`.
- Bạn có thể vào trình duyệt: [http://localhost:8080](http://localhost:8080) (User: `root`, Password: `root`) để xem bảng dữ liệu.

### Bước 2: Chạy API Gateway & Các Service
Mỗi service là một ứng dụng NestJS độc lập, bạn vào từng thư mục để cài đặt và chạy:

```bash
# Chạy API Gateway
cd gateway
npm install
npm run start:dev

# Chạy Auth Service (mở terminal mới)
cd services/auth-service
npm install
npm run start:dev

# Chạy Product Service (mở terminal mới)
cd services/product-service
npm install
npm run start:dev

# Chạy Inventory Service (mở terminal mới)
cd services/inventory-service
npm install
npm run start:dev

# Chạy Order Service (mở terminal mới)
cd services/order-service
npm install
npm run start:dev
```

---

## 📤 Hướng Dẫn Đẩy lên GitHub (Push Git)

Mở terminal trong thư mục `CSM-BE` và chạy:

```bash
# 1. Khởi tạo Git cho Backend
git init
git branch -M main

# 2. Thêm code và commit
git add .
git commit -m "feat: initial commit for CSM-BE microservices architecture"

# 3. Liên kết với repository GitHub của bạn (thay link repo của bạn vào)
git remote add origin https://github.com/<your-username>/CSM-BE.git

# 4. Đẩy code lên GitHub
git push -u origin main
```
Sau đó, vào GitHub -> **Settings** -> **Collaborators** -> Bấm **Add people** để mời bạn bè trong nhóm vào cùng làm việc!
