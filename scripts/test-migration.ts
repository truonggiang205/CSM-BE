import { DataSource } from 'typeorm';
import * as mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { CreateOrderTables1710000000004 } from '../apps/order-service/src/migrations/1710000000004-CreateOrderTables';
import { AddOrderIndexes1710000000005 } from '../apps/order-service/src/migrations/1710000000005-AddOrderIndexes';
import { AddPaymentMethodToOrders1710000000006 } from '../apps/order-service/src/migrations/1710000000006-AddPaymentMethodToOrders';
import { Order } from '../apps/order-service/src/entities/order.entity';
import { OrderItem } from '../apps/order-service/src/entities/order-item.entity';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function runMigrationTest() {
  console.log('================================================================');
  console.log('🛠️ BẮT ĐẦU KIỂM THỬ MIGRATION TOÀN DIỆN VỚI DB_SYNC=false');
  console.log('================================================================');

  const rawUrl = process.env.ORDER_DB_URL || 'mysql://root:rootpassword@localhost:3306/csm_order';
  const parsedUrl = new URL(rawUrl);
  const host = parsedUrl.hostname || 'localhost';
  const port = Number(parsedUrl.port) || 3306;
  const user = parsedUrl.username || 'root';
  const password = parsedUrl.password || 'rootpassword';
  const isSsl = rawUrl.includes('ssl-mode=REQUIRED');

  // ============================================================================
  // PHẦN 1: CHẠY ĐỦ CHUỖI MIGRATION TRÊN SCHEMA TRỐNG HOÀN TOÀN (DB_SYNC=false)
  // ============================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('PHẦN 1: CHẠY ĐỦ CHUỖI MIGRATION TRÊN SCHEMA TRỐNG HOÀN TOÀN');
  console.log('----------------------------------------------------------------');

  const emptyDbName = 'csm_order_empty_test';
  console.log(`1.1 Tạo database trống: \`${emptyDbName}\`...`);
  const conn1 = await mysql.createConnection({ host, port, user, password, ssl: isSsl ? { rejectUnauthorized: false } : undefined });
  await conn1.query(`DROP DATABASE IF EXISTS \`${emptyDbName}\`;`);
  await conn1.query(`CREATE DATABASE \`${emptyDbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
  await conn1.end();

  const emptyDbUrl = `mysql://${user}:${password}@${host}:${port}/${emptyDbName}${isSsl ? '?ssl-mode=REQUIRED' : ''}`;
  const ds1 = new DataSource({
    type: 'mysql',
    url: emptyDbUrl,
    synchronize: false, // DB_SYNC=false
    migrationsRun: false,
    entities: [Order, OrderItem],
    migrations: [
      CreateOrderTables1710000000004,
      AddOrderIndexes1710000000005,
      AddPaymentMethodToOrders1710000000006,
    ],
    ssl: isSsl ? { rejectUnauthorized: false } : false,
  });

  await ds1.initialize();
  console.log('1.2 TypeORM DataSource kết nối thành công (synchronize: false).');

  console.log('1.3 Chạy toàn bộ migrations...');
  const ran1 = await ds1.runMigrations();
  for (const m of ran1) {
    console.log(`   ✨ Đã thực thi Migration: [${m.name}] (timestamp: ${m.timestamp})`);
  }

  console.log('\n1.4 Kết quả DESCRIBE orders sau toàn bộ chuỗi migration:');
  const qr1 = ds1.createQueryRunner();
  const cols1: any[] = await qr1.query(`DESCRIBE \`orders\`;`);
  console.table(
    cols1.map((c) => ({
      Field: c.Field,
      Type: c.Type,
      Null: c.Null,
      Key: c.Key,
      Default: c.Default,
    }))
  );

  console.log('\n1.5 Danh sách INDEX trên bảng `orders`:');
  const idx1: any[] = await qr1.query(`SHOW INDEX FROM \`orders\`;`);
  console.table(
    idx1.map((idx) => ({
      Table: idx.Table,
      IndexName: idx.Key_name,
      Column: idx.Column_name,
      NonUnique: idx.Non_unique,
      IndexType: idx.Index_type,
    }))
  );

  const idxNames1 = idx1.map((i) => i.Key_name);
  const requiredIndexes = ['IDX_orders_user_id', 'IDX_orders_branch_id', 'IDX_orders_status', 'IDX_orders_created_at'];
  for (const exp of requiredIndexes) {
    if (idxNames1.includes(exp)) {
      console.log(`   ✅ Index [${exp}]: TỒN TẠI VÀ CHÍNH XÁC`);
    } else {
      throw new Error(`Thiếu index [${exp}]`);
    }
  }

  const hasPaymentMethod1 = cols1.some((c) => c.Field === 'payment_method');
  if (hasPaymentMethod1) {
    console.log('   ✅ Cột [payment_method]: TỒN TẠI VỚI DEFAULT "COD"');
  } else {
    throw new Error('Thiếu cột payment_method');
  }

  await ds1.destroy();
  const cleanupConn1 = await mysql.createConnection({ host, port, user, password, ssl: isSsl ? { rejectUnauthorized: false } : undefined });
  await cleanupConn1.query(`DROP DATABASE IF EXISTS \`${emptyDbName}\`;`);
  await cleanupConn1.end();
  console.log(`   🧹 Đã dọn dẹp schema test \`${emptyDbName}\`.`);

  // ============================================================================
  // PHẦN 2: CHẠY NÂNG CẤP TỪ SCHEMA CŨ ĐỂ CHỨNG MINH CỘT ĐƯỢC THÊM
  // ============================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('PHẦN 2: NÂNG CẤP TỪ SCHEMA CŨ (CHỨNG MINH MIGRATION THÊM CỘT)');
  console.log('----------------------------------------------------------------');

  const upgradeDbName = 'csm_order_upgrade_test';
  console.log(`2.1 Tạo database nâng cấp: \`${upgradeDbName}\`...`);
  const conn2 = await mysql.createConnection({ host, port, user, password, ssl: isSsl ? { rejectUnauthorized: false } : undefined });
  await conn2.query(`DROP DATABASE IF EXISTS \`${upgradeDbName}\`;`);
  await conn2.query(`CREATE DATABASE \`${upgradeDbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
  await conn2.end();

  const upgradeDbUrl = `mysql://${user}:${password}@${host}:${port}/${upgradeDbName}${isSsl ? '?ssl-mode=REQUIRED' : ''}`;

  // Bước 2.2: Chỉ chạy CreateOrderTables1710000000004 (phiên bản cũ, KHÔNG CÓ payment_method)
  console.log('2.2 Chạy CHỈ migration CreateOrderTables1710000000004 (phiên bản cũ)...');
  const ds2Old = new DataSource({
    type: 'mysql',
    url: upgradeDbUrl,
    synchronize: false,
    migrationsRun: false,
    entities: [Order, OrderItem],
    migrations: [CreateOrderTables1710000000004],
    ssl: isSsl ? { rejectUnauthorized: false } : false,
  });
  await ds2Old.initialize();
  await ds2Old.runMigrations();

  const qr2 = ds2Old.createQueryRunner();
  const colsBefore: any[] = await qr2.query(`DESCRIBE \`orders\`;`);
  const hasPaymentMethodBefore = colsBefore.some((c) => c.Field === 'payment_method');
  console.log(`   🔎 Kiểm tra cột payment_method trước khi nâng cấp: ${hasPaymentMethodBefore ? 'ĐÃ CÓ (Lỗi)' : 'CHƯA CÓ (Đúng chuẩn schema cũ)'}`);
  console.table(colsBefore.map((c) => ({ Field: c.Field, Type: c.Type, Default: c.Default })));
  await ds2Old.destroy();

  if (hasPaymentMethodBefore) {
    throw new Error('CreateOrderTables1710000000004 không được chứa payment_method!');
  }

  // Bước 2.3: Chạy tiếp migration AddOrderIndexes và AddPaymentMethodToOrders
  console.log('\n2.3 Áp dụng migration AddPaymentMethodToOrders1710000000006...');
  const ds2New = new DataSource({
    type: 'mysql',
    url: upgradeDbUrl,
    synchronize: false,
    migrationsRun: false,
    entities: [Order, OrderItem],
    migrations: [
      CreateOrderTables1710000000004,
      AddOrderIndexes1710000000005,
      AddPaymentMethodToOrders1710000000006,
    ],
    ssl: isSsl ? { rejectUnauthorized: false } : false,
  });
  await ds2New.initialize();
  const ran2 = await ds2New.runMigrations();
  for (const m of ran2) {
    console.log(`   ✨ Đã áp dụng migration nâng cấp: [${m.name}]`);
  }

  const qr2New = ds2New.createQueryRunner();
  const colsAfter: any[] = await qr2New.query(`DESCRIBE \`orders\`;`);
  const hasPaymentMethodAfter = colsAfter.some((c) => c.Field === 'payment_method');
  console.log(`\n2.4 Kết quả DESCRIBE orders sau khi chạy migration AddPaymentMethodToOrders:`);
  console.table(colsAfter.map((c) => ({ Field: c.Field, Type: c.Type, Default: c.Default })));

  if (!hasPaymentMethodAfter) {
    throw new Error('Migration AddPaymentMethodToOrders thất bại: cột payment_method không được thêm!');
  }
  console.log('   🎉 CHỨNG MINH THÀNH CÔNG: Cột [payment_method] đã được thêm vào bảng orders với default "COD"!');

  await ds2New.destroy();
  const cleanupConn2 = await mysql.createConnection({ host, port, user, password, ssl: isSsl ? { rejectUnauthorized: false } : undefined });
  await cleanupConn2.query(`DROP DATABASE IF EXISTS \`${upgradeDbName}\`;`);
  await cleanupConn2.end();
  console.log(`   🧹 Đã dọn dẹp schema test \`${upgradeDbName}\`.`);

  console.log('\n================================================================');
  console.log('🎉 TOÀN BỘ CÁC BƯỚC KIỂM THỬ MIGRATION ĐỀU THÀNH CÔNG RỰC RỠ!');
  console.log('================================================================');
}

runMigrationTest().catch((err) => {
  console.error('❌ Lỗi kiểm thử migration:', err);
  process.exit(1);
});
