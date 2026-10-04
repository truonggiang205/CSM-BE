-- CSM Microservices Multi-Schema Database Initialization Script
CREATE DATABASE IF NOT EXISTS `csm_auth` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS `csm_product` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS `csm_inventory` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS `csm_order` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

GRANT ALL PRIVILEGES ON `csm_auth`.* TO 'root'@'%';
GRANT ALL PRIVILEGES ON `csm_product`.* TO 'root'@'%';
GRANT ALL PRIVILEGES ON `csm_inventory`.* TO 'root'@'%';
GRANT ALL PRIVILEGES ON `csm_order`.* TO 'root'@'%';

FLUSH PRIVILEGES;
