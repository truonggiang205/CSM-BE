# Danh Sách Endpoint Toàn Hệ Thống CSM-BE (API Endpoints & Access Control)

Tài liệu này tổng hợp toàn bộ các API Endpoints công khai qua **API Gateway (Port 8000)** và các service nội bộ của hệ thống chuỗi cửa hàng tiện lợi CSM.
Quyền truy cập được xác định chính xác theo mã nguồn thực tế của từng Controller và Guard (`RolesGuard`, `JwtAuthGuard`, `AuthGuard`).

---

## 1. Authentication Service (`/api/v1/auth`, Port 3001)

| Method | Đường dẫn API | Quyền truy cập (RBAC) | Tham số / Body chính | Mã HTTP phản hồi | Mô tả nghiệp vụ & Ghi chú bảo mật |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `GET` | `/api/v1/auth/health` | **Public** (Không cần token) | Không | `200` | Kiểm tra tình trạng hoạt động (Healthcheck) của Auth Service |
| `POST` | `/api/v1/auth/register` | **Public** (Không cần token) | Body: `email`, `password`, `fullName` | `201`, `400`, `409` | Đăng ký tài khoản khách hàng mới.<br>**Bảo mật:** Luôn ép cứng `role: CUSTOMER` và `branch_id: null`, triệt tiêu hoàn toàn privilege escalation. Mật khẩu hash bằng `bcryptjs` ($2b$, salt rounds = 10). |
| `POST` | `/api/v1/auth/login` | **Public** (Không cần token) | Body: `email`, `password` | `200`, `400`, `401` | Đăng nhập hệ thống. Trả về Access Token (15m) và Refresh Token (7d). Hỗ trợ tương thích ngược với hash `$2b$` native trước đây. |
| `POST` | `/api/v1/auth/refresh` | **Public** (Không cần token) | Body: `refreshToken` | `200`, `401` | Cấp cặp token mới.<br>**Bảo mật:** Bắt buộc claim `type === 'refresh'`, từ chối tuyệt đối nếu client truyền Access Token. |
| `GET` | `/api/v1/auth/profile` | **Authenticated** (Tất cả role) | Header: `Authorization: Bearer <access_token>` | `200`, `401`, `404` | Lấy thông tin tài khoản người dùng đang đăng nhập dựa trên JWT `sub`. |

---

## 2. Product Service (`/api/v1/products`, `/api/v1/categories`, Port 3002)

| Method | Đường dẫn API | Quyền truy cập (RBAC) | Tham số / Body chính | Mã HTTP phản hồi | Mô tả nghiệp vụ & Ghi chú bảo mật |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `GET` | `/api/v1/product/health` | **Public** | Không | `200` | Healthcheck Product Service |
| `GET` | `/api/v1/categories` | **Public** | Không | `200` | Lấy toàn bộ danh sách danh mục sản phẩm |
| `POST` | `/api/v1/categories` | **ADMIN** (`RolesGuard`) | Body: `name`, `description` | `201`, `401`, `403` | Tạo danh mục sản phẩm mới (chỉ Quản trị viên hệ thống) |
| `PUT` | `/api/v1/categories/:id` | **ADMIN** (`RolesGuard`) | Path: `id`<br>Body: `name`, `description` | `200`, `401`, `403` | Cập nhật thông tin danh mục sản phẩm |
| `DELETE` | `/api/v1/categories/:id` | **ADMIN** (`RolesGuard`) | Path: `id` | `200`, `401`, `403` | Xóa danh mục sản phẩm |
| `GET` | `/api/v1/products` | **Public** | Không | `200` | Lấy toàn bộ danh sách sản phẩm kèm danh mục (Catalog) |
| `GET` | `/api/v1/products/:id` | **Public** | Path: `id` | `200`, `404` | Xem chi tiết sản phẩm theo ID |
| `POST` | `/api/v1/products` | **ADMIN** (`RolesGuard`) | Body: `sku`, `name`, `description`, `base_price`, `category_id`, `image_url` | `201`, `401`, `403`, `404` | Thêm sản phẩm mới vào danh mục hàng hoá |
| `PUT` | `/api/v1/products/:id` | **ADMIN** (`RolesGuard`) | Path: `id`<br>Body: thông tin cập nhật | `200`, `401`, `403`, `404` | Cập nhật thông tin hoặc giá bán gốc của sản phẩm |
| `DELETE` | `/api/v1/products/:id` | **ADMIN** (`RolesGuard`) | Path: `id` | `200`, `401`, `403` | Xoá sản phẩm khỏi hệ thống |

---

## 3. Branch & Inventory Service (`/api/v1/branches`, `/api/v1/inventory`, Port 3003)

### 3.1 Quản lý Chi nhánh (Branches)

| Method | Đường dẫn API | Quyền truy cập (RBAC) | Tham số / Body chính | Mã HTTP phản hồi | Mô tả nghiệp vụ & Ghi chú bảo mật |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `GET` | `/api/v1/branches` | **Public** | Không | `200` | Lấy danh sách chi nhánh đang hoạt động (`is_active = true`) |
| `GET` | `/api/v1/branches/nearest` | **Public** | Query: `lat` (latitude), `lng` (longitude) | `200`, `400`, `404` | Tìm chi nhánh gần nhất dựa trên toạ độ GPS của khách hàng sử dụng **Công thức Haversine** đường cong Trái Đất (km). Trả về khoảng cách `distance_km`. |
| `GET` | `/api/v1/branches/:id` | **Public** | Path: `id` | `200`, `404` | Xem chi tiết chi nhánh theo ID |
| `POST` | `/api/v1/branches` | **ADMIN** (`RolesGuard`) | Body: `name`, `address`, `phone`, `latitude`, `longitude` | `201`, `401`, `403` | Tạo chi nhánh cửa hàng mới |
| `PUT` | `/api/v1/branches/:id` | **ADMIN** (`RolesGuard`) | Path: `id`<br>Body: thông tin cập nhật | `200`, `401`, `403`, `404` | Cập nhật thông tin hoặc toạ độ chi nhánh |
| `DELETE` | `/api/v1/branches/:id` | **ADMIN** (`RolesGuard`) | Path: `id` | `200`, `401`, `403`, `409` | **Xoá mềm chi nhánh** (`is_active = false`).<br>**Bảo vệ xung đột (409):** Từ chối nếu chi nhánh còn hàng tồn kho > 0 hoặc còn đơn hàng đang ở trạng thái `PENDING`/`CONFIRMED`. |

### 3.2 Quản lý Tồn kho & Saga Điều phối (Inventory)

| Method | Đường dẫn API | Quyền truy cập (RBAC) | Tham số / Body chính | Mã HTTP phản hồi | Mô tả nghiệp vụ & Ghi chú bảo mật |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `GET` | `/api/v1/inventory/health` | **Public** | Không | `200` | Healthcheck Inventory Service |
| `GET` | `/api/v1/inventory/product/:id` | **Public** | Path: `id` (product_id) | `200` | Tra cứu tồn kho của 1 sản phẩm tại tất cả các chi nhánh: `quantity`, `reserved_quantity`, `available`. |
| `GET` | `/api/v1/inventory/branch/:branchId` | **Public** | Path: `branchId` | `200` | Tra cứu toàn bộ mặt hàng tồn kho tại 1 chi nhánh cụ thể |
| `GET` | `/api/v1/inventory/transactions` | **ADMIN**, **BRANCH_MANAGER** | Query: `referenceId`, `stockId` | `200`, `401`, `403` | Xem lịch sử biến động sổ kho (`IN`, `OUT`, `RESERVE`, `CANCEL_RESERVE`) |
| `POST` | `/api/v1/inventory/add-stock` | **ADMIN**, **BRANCH_MANAGER** | Body: `branchId`, `productId`, `quantity`, `referenceId` | `201`, `400`, `401`, `403` | Nhập kho chi nhánh. Sử dụng `pessimistic_write` lock và ghi bản ghi `StockTransaction (IN)`. |
| `POST` | `/api/v1/inventory/reserve-stock` | **Internal / Saga** | Body: `branchId`, `items`, `referenceId` | `200`, `400` | **SAGA Bước 1 - Giữ chỗ kho:** Khóa bi quan `pessimistic_write`, kiểm tra `available >= quantity`, tăng `reserved_quantity`. **Idempotent:** Bỏ qua nếu `referenceId` đã giữ kho trước đó. |
| `POST` | `/api/v1/inventory/confirm-deduct` | **Internal / Saga** | Body: `branchId`, `items`, `referenceId` | `200`, `400` | **SAGA Bước 2 - Trừ kho chính thức:** Giảm đồng thời cả `quantity` và `reserved_quantity`, ghi bản ghi `OUT`. **Idempotent:** Giữ nguyên trạng thái nếu đã trừ. |
| `POST` | `/api/v1/inventory/release-stock` | **Internal / Saga** | Body: `branchId`, `items`, `referenceId` | `200`, `400` | **SAGA Bước 3 - Hoàn kho (Rollback):** Giảm `reserved_quantity`, hoàn trả số lượng có sẵn khi đơn hàng bị huỷ hoặc lỗi thanh toán. **Idempotent.** |

---

## 4. Order Service (`/api/v1/orders`, Port 3004)

| Method | Đường dẫn API | Quyền truy cập (RBAC) | Tham số / Body chính | Mã HTTP phản hồi | Mô tả nghiệp vụ & Ghi chú bảo mật |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `GET` | `/api/v1/orders/health` | **Public** | Không | `200` | Healthcheck Order Service |
| `POST` | `/api/v1/orders` | **CUSTOMER**, **ADMIN**, **BRANCH_MANAGER** (`JwtAuthGuard`) | Body: `branchId`, `items` `[{productId, quantity}]`, `shippingAddress`, `paymentMethod` (`COD`, `MOMO`, `ATM`) | `201`, `400`, `401`, `404` | **Tạo đơn hàng mới (Saga Orchestration):**<br>1. Kiểm tra chi nhánh hợp lệ.<br>2. Xác minh giá gốc từ Product Service.<br>3. Kích hoạt Saga `reserve-stock`.<br>4. Lưu đơn PENDING. Rollback `release-stock` nếu DB lỗi.<br>5. Nếu thanh toán online, tạo URL thanh toán an toàn. |
| `GET` | `/api/v1/orders/my` | **CUSTOMER** (`JwtAuthGuard`) | Query: `page`, `limit`, `status` | `200`, `401` | Khách hàng tra cứu lịch sử mua hàng của chính mình. Định dạng phân trang chuẩn: `{ items, total, page, limit, totalPages }`. |
| `GET` | `/api/v1/orders` | **ADMIN**, **BRANCH_MANAGER**, **STAFF** (`JwtAuthGuard`) | Query: `page`, `limit`, `status`, `branchId`, `search`, `fromDate`, `toDate` | `200`, `400`, `401`, `403` | **Quản trị đơn hàng đa tiêu chí:**<br>- **CUSTOMER bị chặn 403 Forbidden.**<br>- **Khoá chi nhánh:** `BRANCH_MANAGER` và `STAFF` bị ép chặt chỉ xem đơn thuộc chi nhánh được phân công. `ADMIN` xem toàn bộ hệ thống.<br>- Lọc khoảng ngày `fromDate` <= `toDate`, validate lỗi 400 nếu sai định dạng. |
| `GET` | `/api/v1/orders/:id` | **Authenticated** (`JwtAuthGuard`) | Path: `id` | `200`, `401`, `403`, `404` | Xem chi tiết đơn hàng.<br>- `CUSTOMER`: Chỉ xem được đơn của chính mình (403 nếu xem đơn người khác).<br>- `BRANCH_MANAGER`: Chỉ xem đơn thuộc chi nhánh của mình (403 nếu đơn chi nhánh khác).<br>- `ADMIN`: Xem được toàn bộ đơn. |
| `PATCH` | `/api/v1/orders/:id/status` | **Authenticated** (`JwtAuthGuard`) | Path: `id`<br>Body: `status` (`CONFIRMED`, `PAID`, `SHIPPED`, `CANCELLED`) | `200`, `400`, `401`, `403`, `404` | **Cập nhật vòng đời đơn (State Machine & Saga):**<br>- `CUSTOMER`: Chỉ được huỷ đơn của mình khi đang `PENDING`.<br>- Bắt buộc tuân thủ State Machine: `PENDING` -> `CONFIRMED`/`CANCELLED`; `CONFIRMED` -> `PAID`/`SHIPPED`/`CANCELLED`; `PAID` -> `SHIPPED`/`CANCELLED`; `SHIPPED` và `CANCELLED` là trạng thái kết thúc (Terminal).<br>- Chuyển sang `CONFIRMED`/`PAID` tự động gọi Saga `confirm-deduct`. Huỷ đơn `PENDING` tự động gọi Saga `release-stock`. |

---

## 5. Payment Service (`/api/v1/payments`, Port 3005 - Mô Phỏng)

| Method | Đường dẫn API | Quyền truy cập (RBAC) | Tham số / Body chính | Mã HTTP phản hồi | Mô tả nghiệp vụ & Ghi chú bảo mật |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `GET` | `/api/v1/payments/health` | **Public** | Không | `200` | Healthcheck Payment Service |
| `POST` | `/api/v1/payments/create` | **Chủ đơn hàng**, **ADMIN**, hoặc **Nội bộ** (`x-internal-secret`) | Body: `orderId`, `amount`, `method` (`MOMO`, `ATM`) | `201`, `400`, `401`, `403`, `404` | Tạo URL thanh toán trực tuyến mô phỏng kèm JWT token ký số có thời hạn 10 phút. Bắt buộc kiểm tra quyền sở hữu đơn hàng. Từ chối đơn COD với HTTP 400. |
| `GET` | `/api/v1/payments/simulate-success/:orderId` | **Public** (Trình duyệt redirect) | Path: `orderId`<br>Query: `token` (JWT) | `200`, `401`, `404` | Trang HTML giao diện mô phỏng cổng thanh toán (MoMo/VNPAY).<br>**Bảo mật:** Phương thức GET **TUYỆT ĐỐI KHÔNG** thay đổi trạng thái đơn hàng hay trừ tồn kho. Escape HTML toàn diện chống XSS. |
| `POST` | `/api/v1/payments/simulate-confirm` | **Xác thực qua JWT Token** | Body: `orderId`, `token` (hoặc Query `token`) | `200`, `400`, `401`, `404` | **Kích hoạt thanh toán thành công:** Kiểm tra JWT token, chuyển trạng thái đơn `PENDING` -> `CONFIRMED` (trừ kho) -> `PAID`.<br>**Idempotent:** Nếu gọi lặp lại khi đơn đã `PAID` hoặc `CONFIRMED`, trả về kết quả thành công ngay mà không trừ kho lần 2. |

---

## 6. Notification Service (`/api/v1/notifications`, Port 3006 - Mô Phỏng)

| Method | Đường dẫn API | Quyền truy cập | Tham số / Body chính | Mã HTTP phản hồi | Mô tả nghiệp vụ & Ghi chú bảo mật |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `GET` | `/api/v1/notifications/health` | **Public** | Không | `200` | Healthcheck Notification Service |
| `POST` | `/api/v1/notifications/events` | **Nội bộ** | Body: `event`, `payload` | `200`, `201` | Nhận và mô phỏng in-memory các sự kiện tạo đơn hàng (`order_created`), trạng thái thanh toán và cập nhật đơn hàng. |
