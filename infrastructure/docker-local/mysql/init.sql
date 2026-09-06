-- Khởi tạo 4 cơ sở dữ liệu riêng biệt cho kiến trúc Microservices
CREATE DATABASE IF NOT EXISTS `db_auth` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS `db_product` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS `db_inventory` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS `db_order` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Cấp quyền truy cập
GRANT ALL PRIVILEGES ON `db_auth`.* TO 'root'@'%';
GRANT ALL PRIVILEGES ON `db_product`.* TO 'root'@'%';
GRANT ALL PRIVILEGES ON `db_inventory`.* TO 'root'@'%';
GRANT ALL PRIVILEGES ON `db_order`.* TO 'root'@'%';

FLUSH PRIVILEGES;
