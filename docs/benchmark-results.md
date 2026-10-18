# Báo Cáo Đo Lường Hiệu Năng & Chịu Tải CSM-BE (Benchmark Results - CSM-42)

> **Thời gian thực thi:** 2026-10-18T10:05:36.046Z  
> **Môi trường thử nghiệm:** Docker Compose Multi-Container Stack trên Host Local  
> **Công cụ:** Benchmark Suite (Node.js Concurrent Engine & k6 Compatible)

---

## 1. Cấu Hình Phần Cứng & Môi Trường Thử Nghiệm

| Thành phần | Thông số kỹ thuật chi tiết |
| :--- | :--- |
| **CPU** | AMD Ryzen 7 7735HS with Radeon Graphics (16 Cores / Logical Processors) |
| **RAM** | 15.25 GB RAM (Khả dụng lúc test: ~1.25 GB) |
| **Hệ Điều Hành** | Windows_NT 10.0.26300 (x64) |
| **Container Engine** | Docker version 29.8.1, build 4a63305 (WSL2 Backend Engine) |
| **Node.js Runtime** | v26.9.0 (Alpine Linux 22 inside containers) |
| **Cơ Sở Dữ Liệu** | MySQL 8.0 (Docker multi-schema database container) |
| **Sản phẩm kiểm thử** | `Bánh Bao Xá Xíu Phô Mai` (`3378aeb6-143a-4228-a455-403e933cef4c`) tại Chi nhánh `br-01` |

---

## 2. Kịch Bản 1: Đo Lường Hiệu Năng Đọc (Read Scenario)

Các kịch bản đọc được thực hiện qua **API Gateway (Port 8000)** với 20 concurrent connections liên tục:

| Endpoint | Tổng số Request | RPS (Req/sec) | Độ trễ p50 (ms) | Độ trễ p90 (ms) | Độ trễ p95 (ms) | Độ trễ p99 (ms) | Tỉ lệ lỗi | Thời gian chạy |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `GET /products` | 200 | **466.2** | 38 | 53 | 75 | 120 | **0%** | 0.43s |
| `GET /branches/nearest` | 200 | **363.64** | 49 | 86 | 96 | 111 | **0%** | 0.55s |
| `GET /inventory/product/:id` | 200 | **480.77** | 41 | 48 | 52 | 56 | **0%** | 0.42s |

### Kết quả đo lường k6 chuẩn (`grafana/k6` chạy trong Docker network):

Lệnh thực thi:
```bash
Get-Content scripts/benchmark/k6-read.js | docker run --rm -i --network csm-be_csm-network grafana/k6 run -
```

| Chỉ số (Metrics) | Giá trị thực tế (Real Output) | Đánh giá ngưỡng (Threshold) |
| :--- | :--- | :---: |
| **Tổng số request (http_reqs)** | **13,935 requests** (trong 20s) | ✅ Vượt kỳ vọng |
| **Throughput (RPS)** | **696.33 requests/giây** | ✅ Hiệu năng cao |
| **Tỉ lệ thành công (checks_succeeded)** | **100.00%** (13,935 / 13,935 checks pass) | ✅ 0 lỗi (0.00%) |
| **Độ trễ trung bình (avg)** | **20.70 ms** | ✅ Phản hồi nhanh |
| **Độ trễ trung vị (p50 / med)** | **18.84 ms** | ✅ Ổn định |
| **Độ trễ phân vị p90** | **37.57 ms** | ✅ Dưới 50ms |
| **Độ trễ phân vị p95** | **45.55 ms** | ✅ Đạt ngưỡng (<500ms) |
| **Độ trễ Min / Max** | 1.78 ms / 114.35 ms | Không có request nghẽn |

### Nhận xét kịch bản đọc:
- **Tốc độ phản hồi:** Các endpoint đọc danh mục sản phẩm, tính toán khoảng cách GPS Haversine và tra cứu tồn kho qua Gateway đạt mức phản hồi rất tốt với độ trễ trung bình dưới 50ms cho các truy vấn thông thường.
- **Tỉ lệ lỗi:** Đạt **0% lỗi** trên toàn bộ 600 requests đọc thử nghiệm (Node runner) và 13,935 requests (k6).

---

## 3. Kịch Bản 2: Đo Lường Hiệu Năng Ghi & Chống Bán Vượt Tồn (Write Concurrency)

Thực hiện gửi đồng thời các yêu cầu **POST /orders (COD)** tranh chấp trên **CÙNG 1 SẢN PHẨM** tại cùng chi nhánh với 3 mức tải: **10**, **50**, và **100** người dùng đồng thời:

| Số User đồng thời | Tổng Request | Thành công (201) | Từ chối hết hàng (400) | Lỗi hệ thống (500) | RPS | p50 (ms) | p95 (ms) | p99 (ms) | Tình trạng bán vượt tồn |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **10 users** | 10 | 10 | 0 | **0** | **42.37** | 172 | 226 | 226 | ✅ AN TOÀN (0 VƯỢT TỒN) |
| **50 users** | 50 | 50 | 0 | **0** | **56.88** | 631 | 834 | 853 | ✅ AN TOÀN (0 VƯỢT TỒN) |
| **100 users** | 100 | 87 | 13 | **0** | **67.89** | 980 | 1396 | 1404 | ✅ AN TOÀN (0 VƯỢT TỒN) |

### Kiểm chứng tính toàn vẹn tồn kho (Stock Integrity Verification):
- **Tồn kho ban đầu trước khi chạy:** quantity = `147`, reserved = `0`, available = `147`
- **Chống bán âm & bán vượt tồn:**
  - Ở mức **10 và 50 users**: Hệ thống giữ chỗ hàng thành công cho các đơn đặt hàng trong hạn mức tồn kho thực tế.
  - Ở mức **100 users**: Toàn bộ số đơn hàng vượt quá lượng tồn kho có sẵn đều bị từ chối chính xác với mã **HTTP 400 Bad Request** kèm thông báo `Sản phẩm không đủ số lượng có sẵn`.
  - **Tỉ lệ lỗi 500 (Internal Server Error): ĐẠT 0%**. Không có bất kỳ ngoại lệ unhandled exception nào xảy ra trong suốt quá trình tranh chấp kho dữ dội.
  - Tổng số lượng đang giữ (`reserved_quantity`) + đã trừ tuyệt đối không bao giờ vượt quá tổng số lượng thực tế (`quantity`).

---

## 4. Kiểm Chứng Dọn Dẹp Dữ Liệu & Hoàn Trả Tồn Kho (Data Cleanup Verification)

Cơ chế dọn dẹp tự động đã kích hoạt quy trình bù trừ Saga:
- Huỷ toàn bộ các đơn hàng kiểm thử ở trạng thái `PENDING` -> kích hoạt Saga bù trừ `release-stock` tại Inventory Service.
- **Trạng thái tồn kho sau khi dọn dẹp:**
  - Tổng số lượng: `147` (Khớp chính xác với ban đầu: `147`)
  - Số lượng đang giữ: `0` (Khớp kỳ vọng: `0`)
  - Số lượng có sẵn: `147` (Khớp kỳ vọng: `147`)
- **Kết luận:** **✅ DỌN DẸP HOÀN HẢO - TỒN KHO KHÔI PHỤC CHÍNH XÁC 100%**.

---

## 5. Phân Tích Điểm Nghẽn (Bottleneck Analysis) & Đề Xuất Tối Ưu

### Điểm nghẽn nhận diện được:
1. **Pessimistic Locking (`pessimistic_write`) trên bảng Stocks:**
   - *Nguyên nhân:* Để đảm bảo tính toàn vẹn tuyệt đối và không bán vượt tồn giữa nhiều giao dịch đồng thời, Inventory Service sử dụng khoá bi quan trên từng dòng kho (`SELECT ... FOR UPDATE`). Khi 50-100 requests cùng tranh chấp một bản ghi sản phẩm duy nhất, các giao dịch phải xếp hàng tuần tự để giữ kho, khiến độ trễ p95/p99 tăng lên khi concurrency tăng.
   - *Đánh giá:* Đây là sự đánh đổi chấp nhận được (trade-off) giữa **Tính nhất quán dữ liệu (Consistency)** và **Thời gian đáp ứng (Latency)** trong thương mại điện tử để ngăn chặn bán âm tồn.
2. **Chi phí điều phối Saga qua HTTP liên dịch vụ (Network Hop):**
   - *Nguyên nhân:* Khi đặt đơn, Order Service phải gọi tuần tự qua HTTP:
     1. Inventory Service (`GET /branches/:id`) để kiểm tra chi nhánh.
     2. Product Service (`GET /products/:id`) để xác minh giá gốc.
     3. Inventory Service (`POST /inventory/reserve-stock`) để giữ kho.
     4. Lưu Order DB.
   - Việc gọi đồng bộ 3 round-trip HTTP qua Docker bridge network làm tăng độ trễ tổng thể của thao tác ghi.

### Đề xuất tối ưu cho các sprint sau:
1. **Áp dụng Redis Cache cho Master Data:**
   - Cache thông tin chi nhánh (`/branches/:id`) và danh mục/giá sản phẩm (`/products/:id`) bằng Redis với TTL ngắn hoặc invalidate khi update để giảm 2 network round-trips khi tạo đơn hàng.
2. **Sử dụng Message Queue (RabbitMQ / Kafka) cho Event-driven Saga:**
   - Thay thế các lời gọi HTTP đồng bộ giữa Order Service và Inventory Service bằng mô hình Choreography Saga dựa trên Message Broker, cho phép xử lý hàng đợi đặt hàng bất đồng bộ với throughput cao hơn.
3. **Database Connection Pool Tuning:**
   - Tối ưu kích thước connection pool (`extra: { connectionLimit: 30 }`) cho TypeORM trong từng service để tránh chờ connection khi tải ghi tăng đột biến.
