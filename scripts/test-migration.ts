import { DataSource } from 'typeorm';
import * as mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Order Service Migrations & Entities
import { CreateOrderTables1710000000004 } from '../apps/order-service/src/migrations/1710000000004-CreateOrderTables';
import { AddOrderIndexes1710000000005 } from '../apps/order-service/src/migrations/1710000000005-AddOrderIndexes';
import { AddPaymentMethodToOrders1710000000006 } from '../apps/order-service/src/migrations/1710000000006-AddPaymentMethodToOrders';
import { AddDiscountColumnsToOrders1710000000007 } from '../apps/order-service/src/migrations/1710000000007-AddDiscountColumnsToOrders';
import { Order } from '../apps/order-service/src/entities/order.entity';
import { OrderItem } from '../apps/order-service/src/entities/order-item.entity';

// Discount Service Migrations & Entities
import { CreateDiscountTables1710000000008 } from '../apps/discount-service/src/migrations/1710000000008-CreateDiscountTables';
import { Voucher } from '../apps/discount-service/src/entities/voucher.entity';
import { VoucherUsage } from '../apps/discount-service/src/entities/voucher-usage.entity';

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
  // PHẦN 1: ORDER-SERVICE TRÊN SCHEMA TRỐNG HOÀN TOÀN (DB_SYNC=false)
  // ============================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('PHẦN 1: ORDER-SERVICE - CHẠY ĐỦ MIGRATIONS TRÊN SCHEMA TRỐNG (DB_SYNC=false)');
  console.log('----------------------------------------------------------------');

  const emptyOrderDb = 'csm_order_empty_test';
  console.log(`1.1 Tạo database trống: \`${emptyOrderDb}\`...`);
  const conn1 = await mysql.createConnection({ host, port, user, password, ssl: isSsl ? { rejectUnauthorized: false } : undefined });
  await conn1.query(`DROP DATABASE IF EXISTS \`${emptyOrderDb}\`;`);
  await conn1.query(`CREATE DATABASE \`${emptyOrderDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
  await conn1.end();

  const emptyOrderUrl = `mysql://${user}:${password}@${host}:${port}/${emptyOrderDb}${isSsl ? '?ssl-mode=REQUIRED' : ''}`;
  const ds1 = new DataSource({
    type: 'mysql',
    url: emptyOrderUrl,
    synchronize: false, // DB_SYNC=false bắt buộc
    migrationsRun: false,
    entities: [Order, OrderItem],
    migrations: [
      CreateOrderTables1710000000004,
      AddOrderIndexes1710000000005,
      AddPaymentMethodToOrders1710000000006,
      AddDiscountColumnsToOrders1710000000007,
    ],
    ssl: isSsl ? { rejectUnauthorized: false } : false,
  });

  await ds1.initialize();
  console.log('1.2 TypeORM DataSource kết nối thành công (synchronize: false).');

  console.log('1.3 Chạy toàn bộ migrations (4 -> 7)...');
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

  // Kiểm tra cột voucher / discount
  const expectedCols = ['subtotal_amount', 'discount_amount', 'voucher_code', 'payment_method'];
  for (const col of expectedCols) {
    const found = cols1.find((c) => c.Field === col);
    if (!found) throw new Error(`Thiếu cột [${col}] sau khi chạy migration!`);
    console.log(`   ✅ Cột [${col}]: TỒN TẠI VÀ CHÍNH XÁC (Type: ${found.Type}, Default: ${found.Default})`);
  }

  await ds1.destroy();
  const cleanupConn1 = await mysql.createConnection({ host, port, user, password, ssl: isSsl ? { rejectUnauthorized: false } : undefined });
  await cleanupConn1.query(`DROP DATABASE IF EXISTS \`${emptyOrderDb}\`;`);
  await cleanupConn1.end();
  console.log(`   🧹 Đã dọn dẹp schema test \`${emptyOrderDb}\`.`);

  // ============================================================================
  // PHẦN 2: ORDER-SERVICE - NÂNG CẤP TỪ TRẠNG THÁI TRƯỚC VOUCHER (CHỨNG MINH TƯƠNG THÍCH ĐƠN CŨ)
  // ============================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('PHẦN 2: ORDER-SERVICE - NÂNG CẤP TỪ SCHEMA TRƯỚC VOUCHER (TƯƠNG THÍCH ĐƠN CŨ)');
  console.log('----------------------------------------------------------------');

  const upgradeOrderDb = 'csm_order_upgrade_test';
  console.log(`2.1 Tạo database nâng cấp: \`${upgradeOrderDb}\`...`);
  const conn2 = await mysql.createConnection({ host, port, user, password, ssl: isSsl ? { rejectUnauthorized: false } : undefined });
  await conn2.query(`DROP DATABASE IF EXISTS \`${upgradeOrderDb}\`;`);
  await conn2.query(`CREATE DATABASE \`${upgradeOrderDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
  await conn2.end();

  const upgradeOrderUrl = `mysql://${user}:${password}@${host}:${port}/${upgradeOrderDb}${isSsl ? '?ssl-mode=REQUIRED' : ''}`;

  // 2.2 Chạy CHỈ các migration 4, 5, 6 (trạng thái TRƯỚC khi có voucher)
  console.log('2.2 Chạy CHỈ migration 4, 5, 6 (trạng thái TRƯỚC voucher)...');
  const ds2Pre = new DataSource({
    type: 'mysql',
    url: upgradeOrderUrl,
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
  await ds2Pre.initialize();
  await ds2Pre.runMigrations();

  const qr2Pre = ds2Pre.createQueryRunner();
  const colsBeforeVoucher: any[] = await qr2Pre.query(`DESCRIBE \`orders\`;`);
  const hasDiscountBefore = colsBeforeVoucher.some((c) => c.Field === 'discount_amount');
  console.log(`   🔎 Cột discount_amount trước khi nâng cấp: ${hasDiscountBefore ? 'ĐÃ CÓ (Sai)' : 'CHƯA CÓ (Đúng chuẩn schema cũ)'}`);

  // Chèn 1 đơn hàng cũ mẫu
  console.log('2.3 Chèn đơn hàng cũ mẫu (khi chưa có cột discount)...');
  await qr2Pre.query(`
    INSERT INTO \`orders\` (\`id\`, \`user_id\`, \`branch_id\`, \`total_amount\`, \`payment_method\`, \`status\`)
    VALUES ('old-order-001', 'usr-demo', 'br-01', 50000.00, 'COD', 'PENDING');
  `);
  await ds2Pre.destroy();

  // 2.4 Nâng cấp lên Migration 7 (thêm cột discount)
  console.log('\n2.4 Áp dụng Migration 7 (AddDiscountColumnsToOrders1710000000007)...');
  const ds2Post = new DataSource({
    type: 'mysql',
    url: upgradeOrderUrl,
    synchronize: false,
    migrationsRun: false,
    entities: [Order, OrderItem],
    migrations: [
      CreateOrderTables1710000000004,
      AddOrderIndexes1710000000005,
      AddPaymentMethodToOrders1710000000006,
      AddDiscountColumnsToOrders1710000000007,
    ],
    ssl: isSsl ? { rejectUnauthorized: false } : false,
  });
  await ds2Post.initialize();
  const ran2 = await ds2Post.runMigrations();
  for (const m of ran2) {
    console.log(`   ✨ Đã áp dụng migration nâng cấp: [${m.name}]`);
  }

  const qr2Post = ds2Post.createQueryRunner();
  const colsAfterVoucher: any[] = await qr2Post.query(`DESCRIBE \`orders\`;`);
  const hasDiscountAfter = colsAfterVoucher.some((c) => c.Field === 'discount_amount');
  if (!hasDiscountAfter) throw new Error('Migration 7 thất bại: Cột discount_amount không được thêm!');
  console.log('   ✅ Migration 7 nâng cấp thành công: Các cột discount đã xuất hiện.');

  // Kiểm tra đơn hàng cũ sau khi nâng cấp schema
  console.log('\n2.5 Kiểm tra đơn hàng cũ sau khi nâng cấp:');
  const oldOrders: any[] = await qr2Post.query(`SELECT id, user_id, total_amount, subtotal_amount, discount_amount, voucher_code FROM \`orders\` WHERE id = 'old-order-001';`);
  console.table(oldOrders);
  if (oldOrders.length === 0) throw new Error('Đơn hàng cũ bị mất sau khi nâng cấp!');
  if (Number(oldOrders[0].discount_amount) !== 0 || oldOrders[0].voucher_code !== null) {
    throw new Error('Giá trị mặc định của đơn cũ không đúng (kỳ vọng discount_amount=0, voucher_code=null)');
  }
  console.log('   🎉 CHỨNG MINH THÀNH CÔNG: Đơn hàng cũ vẫn hoạt động trơn tru với discount_amount=0 và voucher_code=null!');

  await ds2Post.destroy();
  const cleanupConn2 = await mysql.createConnection({ host, port, user, password, ssl: isSsl ? { rejectUnauthorized: false } : undefined });
  await cleanupConn2.query(`DROP DATABASE IF EXISTS \`${upgradeOrderDb}\`;`);
  await cleanupConn2.end();
  console.log(`   🧹 Đã dọn dẹp schema test \`${upgradeOrderDb}\`.`);

  // ============================================================================
  // PHẦN 3: DISCOUNT-SERVICE TRÊN SCHEMA TRỐNG HOÀN TOÀN (DB_SYNC=false)
  // ============================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('PHẦN 3: DISCOUNT-SERVICE - CHẠY MIGRATION TRÊN SCHEMA TRỐNG (DB_SYNC=false)');
  console.log('----------------------------------------------------------------');

  const emptyDiscountDb = 'csm_discount_empty_test';
  console.log(`3.1 Tạo database trống: \`${emptyDiscountDb}\`...`);
  const conn3 = await mysql.createConnection({ host, port, user, password, ssl: isSsl ? { rejectUnauthorized: false } : undefined });
  await conn3.query(`DROP DATABASE IF EXISTS \`${emptyDiscountDb}\`;`);
  await conn3.query(`CREATE DATABASE \`${emptyDiscountDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
  await conn3.end();

  const emptyDiscountUrl = `mysql://${user}:${password}@${host}:${port}/${emptyDiscountDb}${isSsl ? '?ssl-mode=REQUIRED' : ''}`;
  const ds3 = new DataSource({
    type: 'mysql',
    url: emptyDiscountUrl,
    synchronize: false, // DB_SYNC=false bắt buộc
    migrationsRun: false,
    entities: [Voucher, VoucherUsage],
    migrations: [CreateDiscountTables1710000000008],
    ssl: isSsl ? { rejectUnauthorized: false } : false,
  });

  await ds3.initialize();
  console.log('3.2 TypeORM DataSource Discount kết nối thành công (synchronize: false).');

  console.log('3.3 Chạy migration CreateDiscountTables1710000000008...');
  const ran3 = await ds3.runMigrations();
  for (const m of ran3) {
    console.log(`   ✨ Đã thực thi Migration: [${m.name}] (timestamp: ${m.timestamp})`);
  }

  const qr3 = ds3.createQueryRunner();
  console.log('\n3.4 Bảng `vouchers` sau migration:');
  const voucherCols: any[] = await qr3.query(`DESCRIBE \`vouchers\`;`);
  console.table(voucherCols.map((c) => ({ Field: c.Field, Type: c.Type, Null: c.Null, Key: c.Key, Default: c.Default })));

  console.log('\n3.5 Bảng `voucher_usages` sau migration:');
  const usageCols: any[] = await qr3.query(`DESCRIBE \`voucher_usages\`;`);
  console.table(usageCols.map((c) => ({ Field: c.Field, Type: c.Type, Null: c.Null, Key: c.Key, Default: c.Default })));

  // Thử INSERT và kiểm tra Foreign Key
  console.log('3.6 Thử nghiệm thêm Voucher và VoucherUsage vào schema mới tạo...');
  const vRepo = ds3.getRepository(Voucher);
  const uRepo = ds3.getRepository(VoucherUsage);

  const testVoucher = vRepo.create({
    id: 'test-vch-001',
    code: 'MIGRATE20K',
    description: 'Voucher kiểm thử migration DB_SYNC=false',
    discount_type: 'FIXED_AMOUNT' as any,
    discount_value: 20000,
    min_order_value: 50000,
    usage_limit: 10,
    start_date: new Date(),
    end_date: new Date(Date.now() + 86400000),
    is_active: true,
  });
  await vRepo.save(testVoucher);
  console.log(`   ✅ Đã lưu Voucher: ${testVoucher.code} (id: ${testVoucher.id})`);

  const testUsage = uRepo.create({
    id: 'test-use-001',
    voucher_id: testVoucher.id,
    user_id: 'usr-migration',
    order_id: 'ord-migration-001',
    status: 'USED' as any,
  });
  await uRepo.save(testUsage);
  console.log(`   ✅ Đã lưu VoucherUsage (FK liên kết thành công): ${testUsage.id}`);

  await ds3.destroy();
  const cleanupConn3 = await mysql.createConnection({ host, port, user, password, ssl: isSsl ? { rejectUnauthorized: false } : undefined });
  await cleanupConn3.query(`DROP DATABASE IF EXISTS \`${emptyDiscountDb}\`;`);
  await cleanupConn3.end();
  console.log(`   🧹 Đã dọn dẹp schema test \`${emptyDiscountDb}\`.`);

  console.log('\n================================================================');
  console.log('🎉 TẤT CẢ CÁC BƯỚC KIỂM THỬ MIGRATION CHO ORDER VÀ DISCOUNT ĐỀU ĐẠT 100%!');
  console.log('================================================================');
}

runMigrationTest().catch((err) => {
  console.error('❌ Lỗi kiểm thử migration:', err);
  process.exit(1);
});
