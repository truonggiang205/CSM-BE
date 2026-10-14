import { DataSource } from 'typeorm';
import * as mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { CreateOrderTables1710000000004 } from '../apps/order-service/src/migrations/1710000000004-CreateOrderTables';
import { AddOrderIndexes1710000000005 } from '../apps/order-service/src/migrations/1710000000005-AddOrderIndexes';
import { Order } from '../apps/order-service/src/entities/order.entity';
import { OrderItem } from '../apps/order-service/src/entities/order-item.entity';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function runMigrationTest() {
  console.log('================================================================');
  console.log('🛠️ BẮT ĐẦU KIỂM THỬ MIGRATION AddOrderIndexes VỚI DB_SYNC=false');
  console.log('================================================================');

  const rawUrl = process.env.ORDER_DB_URL || 'mysql://root:rootpassword@localhost:3306/csm_order';
  const parsedUrl = new URL(rawUrl);
  const host = parsedUrl.hostname || 'localhost';
  const port = Number(parsedUrl.port) || 3306;
  const user = parsedUrl.username || 'root';
  const password = parsedUrl.password || 'rootpassword';
  const isSsl = rawUrl.includes('ssl-mode=REQUIRED');

  const testDbName = 'csm_order_migration_test_empty';

  console.log(`1. Kết nối tới MySQL Host: ${host}:${port} với User: ${user}`);
  const connection = await mysql.createConnection({
    host,
    port,
    user,
    password,
    ssl: isSsl ? { rejectUnauthorized: false } : undefined,
  });

  console.log(`2. Tạo schema trống hoàn toàn: \`${testDbName}\`...`);
  await connection.query(`DROP DATABASE IF EXISTS \`${testDbName}\`;`);
  await connection.query(`CREATE DATABASE \`${testDbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
  await connection.end();

  console.log(`3. Khởi tạo TypeORM DataSource trên schema \`${testDbName}\` với DB_SYNC = false...`);
  const testDbUrl = `mysql://${user}:${password}@${host}:${port}/${testDbName}${isSsl ? '?ssl-mode=REQUIRED' : ''}`;

  const dataSource = new DataSource({
    type: 'mysql',
    url: testDbUrl,
    synchronize: false, // BẮT BUỘC: DB_SYNC=false
    migrationsRun: false,
    entities: [Order, OrderItem],
    migrations: [CreateOrderTables1710000000004, AddOrderIndexes1710000000005],
    ssl: isSsl ? { rejectUnauthorized: false } : false,
  });

  await dataSource.initialize();
  console.log('   ✅ TypeORM DataSource đã kết nối thành công (synchronize: false).');

  console.log('4. Thực thi chạy các Migrations: CreateOrderTables và AddOrderIndexes...');
  const executedMigrations = await dataSource.runMigrations();
  for (const m of executedMigrations) {
    console.log(`   ✨ Đã thực thi Migration: [${m.name}] (timestamp: ${m.timestamp})`);
  }

  console.log('\n5. Kiểm tra cấu trúc bảng `orders` sau khi migration:');
  const queryRunner = dataSource.createQueryRunner();
  const columns: any[] = await queryRunner.query(`DESCRIBE \`orders\`;`);
  console.table(
    columns.map((c) => ({
      Field: c.Field,
      Type: c.Type,
      Null: c.Null,
      Key: c.Key,
      Default: c.Default,
    }))
  );

  console.log('\n6. Kiểm tra danh sách INDEX trên bảng `orders`:');
  const indexes: any[] = await queryRunner.query(`SHOW INDEX FROM \`orders\`;`);
  const indexSummary = indexes.map((idx) => ({
    Table: idx.Table,
    IndexName: idx.Key_name,
    Column: idx.Column_name,
    NonUnique: idx.Non_unique,
    IndexType: idx.Index_type,
  }));
  console.table(indexSummary);

  // Xác thực sự tồn tại của 4 index từ migration AddOrderIndexes
  const indexNames = indexes.map((i) => i.Key_name);
  const requiredIndexes = [
    'IDX_orders_user_id',
    'IDX_orders_branch_id',
    'IDX_orders_status',
    'IDX_orders_created_at',
  ];

  let allPassed = true;
  for (const expected of requiredIndexes) {
    if (indexNames.includes(expected)) {
      console.log(`   ✅ Index [${expected}]: TỒN TẠI VÀ CHÍNH XÁC`);
    } else {
      console.log(`   ❌ Index [${expected}]: THIẾU`);
      allPassed = false;
    }
  }

  console.log('\n7. Dọn dẹp schema test sau khi kiểm thử...');
  await dataSource.destroy();

  const cleanupConn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    ssl: isSsl ? { rejectUnauthorized: false } : undefined,
  });
  await cleanupConn.query(`DROP DATABASE IF EXISTS \`${testDbName}\`;`);
  await cleanupConn.end();
  console.log(`   🧹 Đã xoá schema test \`${testDbName}\`.`);

  if (!allPassed) {
    throw new Error('Một hoặc nhiều Index bị thiếu sau migration!');
  }

  console.log('\n================================================================');
  console.log('🎉 KẾT QUẢ: Migration AddOrderIndexes với DB_SYNC=false THÀNH CÔNG RỰC RỠ!');
  console.log('================================================================');
}

runMigrationTest().catch((err) => {
  console.error('❌ Lỗi khi chạy migration test:', err);
  process.exit(1);
});
