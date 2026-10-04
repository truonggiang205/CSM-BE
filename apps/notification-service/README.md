# CSM Notification Service (Simulation / Mô Phỏng)

## 📌 Tổng quan kiến trúc (C3 Architectural Specification)
`csm-notification-service` đảm nhiệm việc lắng nghe các sự kiện thông báo của hệ sinh thái CSM (ví dụ: `order_created`, thông báo xác nhận đơn hàng, gửi Email/SMS đến khách hàng).

> ⚠️ **LƯU Ý QUAN TRỌNG VỀ KIẾN TRÚC MÔ PHỎNG:**
> - Hiện tại, dịch vụ hoạt động theo cơ chế **MÔ PHỎNG (Simulation)** qua giao thức HTTP REST/in-memory handler thay vì kết nối đến cụm RabbitMQ/Kafka thực tế.
> - Thiết kế này được áp dụng có chủ đích nhằm tối ưu tài nguyên phát triển cục bộ và đơn giản hóa môi trường kiểm thử/chạy dev mà không cần phải dựng cụm message broker RabbitMQ độc lập.
> - Khi hệ thống chuyển sang môi trường production quy mô lớn, endpoint `POST /notifications/events` sẽ được thay thế bằng AMQP consumer lắng nghe topic exchange từ RabbitMQ cluster mà không làm thay đổi luồng nghiệp vụ của các dịch vụ khác.

## 📡 API Endpoints
- `GET /notifications/health`: Kiểm tra trạng thái hoạt động (trả về `{ "status": "ok", "service": "notification-service", "mode": "simulation" }`).
- `POST /notifications/events`: Nhận sự kiện thông báo (`event`, `payload`), mô phỏng gửi email và SMS bất đồng bộ.
