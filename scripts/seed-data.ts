import { DataSource, In } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as bcrypt from 'bcryptjs';
import * as zlib from 'zlib';
import * as readline from 'readline';
import * as mysql from 'mysql2/promise';
import axios from 'axios';

// Entities
import { Category } from '../apps/product-service/src/entities/category.entity';
import { Product } from '../apps/product-service/src/entities/product.entity';
import { Branch } from '../apps/inventory-service/src/entities/branch.entity';
import { Stock } from '../apps/inventory-service/src/entities/stock.entity';
import { StockTransaction, TransactionType } from '../apps/inventory-service/src/entities/stock-transaction.entity';
import { User, UserRole } from '../apps/auth-service/src/entities/user.entity';
import { Order, OrderStatus } from '../apps/order-service/src/entities/order.entity';
import { OrderItem } from '../apps/order-service/src/entities/order-item.entity';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const GATEWAY_URL = process.env.API_GATEWAY_URL || 'http://localhost:8000/api/v1';
const UPLOADS_BASE_URL = (process.env.PUBLIC_GATEWAY_URL || 'http://localhost:8000').replace(/\/+$/, '');

// -----------------------------------------------------------------------------
// DỮ LIỆU DEMO CỐ ĐỊNH CHUẨN CỬA HÀNG TIỆN LỢI CSM
// -----------------------------------------------------------------------------

const seedBranches = [
  {
    id: 'br-01',
    name: 'CSM Bến Nghé - Quận 1',
    address: '123 Lê Lợi, Phường Bến Nghé, Quận 1, TP.HCM',
    phone: '028.3822.0001',
    latitude: 10.7719600,
    longitude: 106.7001400,
  },
  {
    id: 'br-02',
    name: 'CSM Phú Mỹ Hưng - Quận 7',
    address: '456 Nguyễn Lương Bằng, Phường Tân Phú, Quận 7, TP.HCM',
    phone: '028.5413.0002',
    latitude: 10.7295000,
    longitude: 106.7218000,
  },
  {
    id: 'br-03',
    name: 'CSM Hàng Xanh - Bình Thạnh',
    address: '789 Điện Biên Phủ, Phường 25, Quận Bình Thạnh, TP.HCM',
    phone: '028.3512.0003',
    latitude: 10.8016000,
    longitude: 106.7118000,
  },
];

const seedCategories = [
  {
    name: 'Đồ uống & Giải khát',
    description: 'Các loại trà sữa, cà phê, nước tăng lực và nước khoáng thanh mát giải nhiệt',
  },
  {
    name: 'Bánh kẹo & Snack',
    description: 'Snack khoai tây sấy giòn, bắp rang bơ, bánh quy nhập khẩu và kẹo thơm ngon',
  },
  {
    name: 'Mì & Thức ăn nhanh',
    description: 'Mì ly, bánh bao xá xíu nóng hổi, cơm nắm onigiri và xúc xích tiệt trùng chuẩn vị',
  },
  {
    name: 'Sữa & Sản phẩm từ sữa',
    description: 'Sữa tươi tiệt trùng, sữa chua uống men sống và sữa hạt tự nhiên bổ dưỡng',
  },
  {
    name: 'Đồ dùng cá nhân & Tiện ích',
    description: 'Khăn ướt kháng khuẩn, gel rửa tay khô, khẩu trang y tế và bàn chải tiện dụng',
  },
];

const seedProducts = [
  // 1. Đồ uống & Giải khát (6 sản phẩm)
  {
    sku: 'SKU-DRK-001',
    name: 'Trà Sữa Trân Châu CSM',
    description: 'Trà sữa đậm vị hồng trà truyền thống cùng trân châu đen dai giòn',
    base_price: 35000,
    categoryName: 'Đồ uống & Giải khát',
  },
  {
    sku: 'SKU-DRK-002',
    name: 'Cà Phê Sữa Đá Sài Gòn',
    description: 'Cà phê Robusta đậm đặc pha cùng sữa đặc thơm béo chuẩn vị Sài Gòn',
    base_price: 25000,
    categoryName: 'Đồ uống & Giải khát',
  },
  {
    sku: 'SKU-DRK-003',
    name: 'Trà Đào Cam Sả Tươi',
    description: 'Trà đào thanh mát quyện hương sả và cam tươi mọng nước',
    base_price: 32000,
    categoryName: 'Đồ uống & Giải khát',
  },
  {
    sku: 'SKU-DRK-004',
    name: 'Nước Tăng Lực Red Bull 250ml',
    description: 'Nước tăng lực lon lùn chính hãng bổ sung năng lượng tức thì',
    base_price: 15000,
    categoryName: 'Đồ uống & Giải khát',
  },
  {
    sku: 'SKU-DRK-005',
    name: 'Nước Khoáng Thiên Nhiên La Vie 500ml',
    description: 'Nước khoáng đóng chai tiện lợi thanh khiết giải tỏa cơn khát',
    base_price: 8000,
    categoryName: 'Đồ uống & Giải khát',
  },
  {
    sku: 'SKU-DRK-006',
    name: 'Cà Phê Đen Đá Không Đường',
    description: 'Cà phê nguyên chất đậm đà, giúp tinh thần tỉnh táo làm việc',
    base_price: 20000,
    categoryName: 'Đồ uống & Giải khát',
  },

  // 2. Bánh kẹo & Snack (5 sản phẩm)
  {
    sku: 'SKU-SNK-001',
    name: "Snack Khoai Tây Lay's Vị Tảo Biển 56g",
    description: 'Khoai tây sấy giòn rụm tẩm vị rong biển Nhật Bản thơm lừng',
    base_price: 16000,
    categoryName: 'Bánh kẹo & Snack',
  },
  {
    sku: 'SKU-SNK-002',
    name: 'Snack Bắp Cay Oishi 40g',
    description: 'Bắp cay giòn rụm vị cay cay ngọt ngọt thơm bùi đậm đà',
    base_price: 8000,
    categoryName: 'Bánh kẹo & Snack',
  },
  {
    sku: 'SKU-SNK-003',
    name: 'Bánh Quy Bơ Danisa 200g',
    description: 'Bánh quy bơ hoàng gia thơm ngậy nhập khẩu từ Đan Mạch',
    base_price: 55000,
    categoryName: 'Bánh kẹo & Snack',
  },
  {
    sku: 'SKU-SNK-004',
    name: 'Kẹo Cao Su Cool Air Bạc Hà',
    description: 'Kẹo cao su làm thơm miệng hương bạc hà the mát sảng khoái',
    base_price: 12000,
    categoryName: 'Bánh kẹo & Snack',
  },
  {
    sku: 'SKU-SNK-005',
    name: 'Bánh Que Pocky Chocolate 40g',
    description: 'Bánh que nướng giòn phủ lớp kem socola ngọt ngào thơm ngon',
    base_price: 18000,
    categoryName: 'Bánh kẹo & Snack',
  },

  // 3. Mì & Thức ăn nhanh (5 sản phẩm)
  {
    sku: 'SKU-NDL-001',
    name: 'Mì Trộn Cay Indomie Mi Goreng',
    description: 'Mì xào khô hương vị Indonesia đậm đà kèm sốt cay đặc biệt',
    base_price: 15000,
    categoryName: 'Mì & Thức ăn nhanh',
  },
  {
    sku: 'SKU-NDL-002',
    name: 'Bánh Bao Xá Xíu Trứng Cút Nóng',
    description: 'Bánh bao hấp nóng nhân thịt xá xíu đậm đà và trứng cút bùi',
    base_price: 22000,
    categoryName: 'Mì & Thức ăn nhanh',
  },
  {
    sku: 'SKU-NDL-003',
    name: 'Mì Ly Hảo Hảo Tôm Chua Cay',
    description: 'Mì ly tiện lợi 3 phút với hương vị tôm chua cay quốc dân',
    base_price: 12000,
    categoryName: 'Mì & Thức ăn nhanh',
  },
  {
    sku: 'SKU-NDL-004',
    name: 'Cơm Nắm Onigiri Cá Hồi Mayonnaise',
    description: 'Cơm dẻo cuộn rong biển giòn kèm nhân cá hồi sốt béo ngậy',
    base_price: 20000,
    categoryName: 'Mì & Thức ăn nhanh',
  },
  {
    sku: 'SKU-NDL-005',
    name: 'Xúc Xích Phô Mai Vissan Nóng',
    description: 'Xúc xích tiệt trùng nhân phô mai béo ngậy ăn liền dinh dưỡng',
    base_price: 16000,
    categoryName: 'Mì & Thức ăn nhanh',
  },

  // 4. Sữa & Sản phẩm từ sữa (5 sản phẩm)
  {
    sku: 'SKU-MLK-001',
    name: 'Sữa Tươi Tiệt Trùng Vinamilk Ít Đường 180ml',
    description: 'Sữa tươi 100% nguyên chất tiệt trùng bổ sung canxi và vitamin D',
    base_price: 10000,
    categoryName: 'Sữa & Sản phẩm từ sữa',
  },
  {
    sku: 'SKU-MLK-002',
    name: 'Sữa Chua Uống Men Sống Probi 130ml',
    description: 'Sữa chua uống hỗ trợ tiêu hoá chứa 65 tỷ lợi khuẩn L.Casey',
    base_price: 9000,
    categoryName: 'Sữa & Sản phẩm từ sữa',
  },
  {
    sku: 'SKU-MLK-003',
    name: 'Sữa Lúa Mạch Milo Hộp 180ml',
    description: 'Thức uống lúa mạch socola thơm béo cung cấp năng lượng tích cực',
    base_price: 11000,
    categoryName: 'Sữa & Sản phẩm từ sữa',
  },
  {
    sku: 'SKU-MLK-004',
    name: 'Sữa Hạt Óc Chó TH true NUT 180ml',
    description: 'Sữa hạt dinh dưỡng tự nhiên tốt cho tim mạch và phát triển trí não',
    base_price: 14000,
    categoryName: 'Sữa & Sản phẩm từ sữa',
  },
  {
    sku: 'SKU-MLK-005',
    name: 'Sữa Chua Ăn Nha Đam Vinamilk 100g',
    description: 'Sữa chua lên men tự nhiên kết hợp miếng nha đam giòn tươi mát',
    base_price: 8000,
    categoryName: 'Sữa & Sản phẩm từ sữa',
  },

  // 5. Đồ dùng cá nhân & Tiện ích (5 sản phẩm)
  {
    sku: 'SKU-PER-001',
    name: 'Khăn Giấy Ướt Kháng Khuẩn CSM Gói 20 tờ',
    description: 'Khăn ướt không cồn, diệt khuẩn 99.9% êm dịu bảo vệ làn da',
    base_price: 15000,
    categoryName: 'Đồ dùng cá nhân & Tiện ích',
  },
  {
    sku: 'SKU-PER-002',
    name: 'Gel Rửa Tay Khô Lifebuoy 50ml',
    description: 'Gel rửa tay sạch khuẩn khô nhanh, tiện lợi mang theo hàng ngày',
    base_price: 25000,
    categoryName: 'Đồ dùng cá nhân & Tiện ích',
  },
  {
    sku: 'SKU-PER-003',
    name: 'Khẩu Trang Y Tế 4 Lớp Kháng Khuẩn (Gói 10 cái)',
    description: 'Khẩu trang chuẩn y tế 4 lớp kháng khuẩn thoáng khí ngăn bụi mịn',
    base_price: 20000,
    categoryName: 'Đồ dùng cá nhân & Tiện ích',
  },
  {
    sku: 'SKU-PER-004',
    name: 'Bàn Chải Đánh Răng Than Hoạt Tính Colgate',
    description: 'Lông chải siêu mảnh phủ than hoạt tính làm sạch sâu kẽ răng',
    base_price: 28000,
    categoryName: 'Đồ dùng cá nhân & Tiện ích',
  },
  {
    sku: 'SKU-PER-005',
    name: 'Bật Lửa Tiện Dụng Cricket',
    description: 'Bật lửa gas chống gió an toàn tiện lợi bỏ túi gọn nhẹ',
    base_price: 10000,
    categoryName: 'Đồ dùng cá nhân & Tiện ích',
  },
];

// Định nghĩa màu sắc ảnh placeholder theo từng danh mục
const categoryColorMap: Record<string, [number, number, number]> = {
  'Đồ uống & Giải khát': [56, 142, 233],     // Xanh dương
  'Bánh kẹo & Snack': [245, 140, 44],       // Cam ấm
  'Mì & Thức ăn nhanh': [229, 57, 53],       // Đỏ tươi
  'Sữa & Sản phẩm từ sữa': [79, 195, 247],   // Xanh da trời nhạt
  'Đồ dùng cá nhân & Tiện ích': [46, 125, 50], // Xanh lục ngọc
};

// -----------------------------------------------------------------------------
// HELPER SINH ẢNH PNG HỢP LỆ TRONG BỘ NHỚ (< 2KB, KHÔNG CẦN THƯ VIỆN NGOÀI)
// -----------------------------------------------------------------------------
function generatePngBuffer(width: number, height: number, r: number, g: number, b: number): Buffer {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  function crc32(buf: Buffer) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
  function makeChunk(type: string, data: Buffer) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const rawRows: Buffer[] = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    row[0] = 0; // filter type: None
    for (let x = 0; x < width; x++) {
      // Viền gradient nhẹ cho ảnh thẩm mỹ
      const isBorder = x < 2 || x >= width - 2 || y < 2 || y >= height - 2;
      row[1 + x * 3] = isBorder ? Math.max(0, r - 40) : r;
      row[1 + x * 3 + 1] = isBorder ? Math.max(0, g - 40) : g;
      row[1 + x * 3 + 2] = isBorder ? Math.max(0, b - 40) : b;
    }
    rawRows.push(row);
  }
  const compressed = zlib.deflateSync(Buffer.concat(rawRows));
  return Buffer.concat([
    sig,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

// -----------------------------------------------------------------------------
// HELPER HỎI XÁC NHẬN NẾU CHẠY TƯƠNG TÁC (--reset)
// -----------------------------------------------------------------------------
async function confirmPrompt(message: string): Promise<boolean> {
  if (!process.stdin.isTTY) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(message, (ans) => {
      rl.close();
      resolve(ans.trim().toLowerCase() === 'y' || ans.trim().toLowerCase() === 'yes');
    });
  });
}

// -----------------------------------------------------------------------------
// TIẾN TRÌNH RESET DỮ LIỆU DEMO (--reset)
// -----------------------------------------------------------------------------
async function handleReset(dataSources: {
  authDs: DataSource;
  productDs: DataSource;
  inventoryDs: DataSource;
  orderDs: DataSource;
}) {
  const isConfirmed =
    process.argv.includes('-y') ||
    process.argv.includes('--yes') ||
    (await confirmPrompt('⚠️ Bạn có chắc chắn muốn xoá dữ liệu demo (không drop database)? [y/N]: '));

  if (!isConfirmed) {
    console.log('🛑 Huỷ bỏ thao tác reset.');
    return;
  }

  console.log('\n🧹 ĐANG XOÁ TOÀN BỘ DỮ LIỆU DEMO VÀ DỌN SẠCH DỮ LIỆU TEST...');
  const summary: Record<string, number> = {};

  const { authDs, productDs, inventoryDs, orderDs } = dataSources;

  // 1. Order DB: Xoá TOÀN BỘ đơn hàng và chi tiết đơn hàng (để chuẩn bị seed lại 12 đơn sạch)
  const orderRepo = orderDs.getRepository(Order);
  const orderItemRepo = orderDs.getRepository(OrderItem);
  const delItems = await orderItemRepo.createQueryBuilder().delete().execute();
  const delOrders = await orderRepo.createQueryBuilder().delete().execute();
  summary['order_items'] = delItems.affected || 0;
  summary['orders'] = delOrders.affected || 0;

  // 2. Inventory DB: Xoá giao dịch kho và giải phóng toàn bộ tồn kho đặt trước
  const txRepo = inventoryDs.getRepository(StockTransaction);
  const stockRepo = inventoryDs.getRepository(Stock);

  const delTx = await txRepo.createQueryBuilder().delete().execute();
  summary['stock_transactions'] = delTx.affected || 0;

  await stockRepo.createQueryBuilder().update(Stock).set({ reserved_quantity: 0 }).execute();

  // 3. Product DB: Xoá sản phẩm demo và danh mục
  const prodRepo = productDs.getRepository(Product);
  const catRepo = productDs.getRepository(Category);

  const demoSkus = seedProducts.map((p) => p.sku);
  // Thêm các SKU cũ giai đoạn trước nếu có
  const oldSkus = ['SKU-TS-001', 'SKU-CF-002', 'SKU-BB-003', 'SKU-MT-004', 'SKU-SN-005'];
  const allTargetSkus = [...demoSkus, ...oldSkus];

  const foundProds = await prodRepo.find({ where: { sku: In(allTargetSkus) } });
  const prodIds = foundProds.map((p) => p.id);

  if (prodIds.length > 0) {
    // Xoá stocks liên quan trước
    const delStocks = await stockRepo.delete({ product_id: In(prodIds) });
    summary['stocks'] = delStocks.affected || 0;

    const delProds = await prodRepo.delete({ id: In(prodIds) });
    summary['products'] = delProds.affected || 0;
  }

  const catNames = [...seedCategories.map((c) => c.name), 'Đồ uống & Trà sữa', 'Thức ăn nhanh'];
  const delCats = await catRepo
    .createQueryBuilder()
    .delete()
    .where('name IN (:...names)', { names: catNames })
    .execute();
  summary['categories'] = delCats.affected || 0;

  // 4. Auth DB: Xoá toàn bộ tài khoản thử nghiệm phát sinh (cust_*, momo_*, test_*), chỉ giữ đúng 6 tài khoản seed demo
  const userRepo = authDs.getRepository(User);
  const seedEmails = [
    'admin@csm.vn',
    'manager.q1@csm.vn',
    'manager.q2@csm.vn',
    'customer1@csm.vn',
    'customer2@csm.vn',
    'customer@csm.vn',
  ];
  const delUsers = await userRepo
    .createQueryBuilder()
    .delete()
    .where('email NOT IN (:...seedEmails)', { seedEmails })
    .execute();
  summary['extraneous_users'] = delUsers.affected || 0;

  // 5. Discount DB: Xoá toàn bộ voucher thử nghiệm và lịch sử sử dụng voucher
  try {
    const rawDiscUrl = process.env.DISCOUNT_DB_URL;
    if (!rawDiscUrl) {
      throw new Error('Thiếu biến môi trường bắt buộc: DISCOUNT_DB_URL');
    }
    const parsedDisc = new URL(rawDiscUrl);
    const isSsl = rawDiscUrl.includes('ssl-mode=REQUIRED') || rawDiscUrl.includes('aivencloud.com');
    const connDisc = await mysql.createConnection({
      host: parsedDisc.hostname || 'localhost',
      port: Number(parsedDisc.port) || 3306,
      user: decodeURIComponent(parsedDisc.username || 'root'),
      password: decodeURIComponent(parsedDisc.password || ''),
      database: parsedDisc.pathname.replace(/^\//, '') || 'csm_discount',
      ...(isSsl ? { ssl: { rejectUnauthorized: false } } : {}),
    });
    const [delUsages]: any = await connDisc.query('DELETE FROM `voucher_usages`');
    const [delVouchers]: any = await connDisc.query('DELETE FROM `vouchers`');
    summary['voucher_usages'] = delUsages.affectedRows || 0;
    summary['vouchers'] = delVouchers.affectedRows || 0;
    await connDisc.end();
  } catch (discErr: any) {
    console.warn('  ⚠️ Không thể kết nối csm_discount để reset:', discErr.message);
  }

  console.log('✅ KẾT QUẢ RESET DỮ LIỆU DEMO:');
  for (const [table, count] of Object.entries(summary)) {
    console.log(`  - ${table}: Đã xoá/reset ${count} bản ghi`);
  }
  console.log('======================================================\n');
  console.log('======================================================\n');
}

// -----------------------------------------------------------------------------
// TIẾN TRÌNH CHÍNH SEED DỮ LIỆU DEMO IDEMPOTENT
// -----------------------------------------------------------------------------
async function runSeed() {
  const isReset = process.argv.includes('--reset');
  const forceRemote = process.argv.includes('--force-remote');

  const authDbUrl = process.env.AUTH_DB_URL;
  const productDbUrl = process.env.PRODUCT_DB_URL;
  const inventoryDbUrl = process.env.INVENTORY_DB_URL;
  const orderDbUrl = process.env.ORDER_DB_URL;
  const discountDbUrl = process.env.DISCOUNT_DB_URL;
  const missingDbVars = [
    ['AUTH_DB_URL', authDbUrl],
    ['PRODUCT_DB_URL', productDbUrl],
    ['INVENTORY_DB_URL', inventoryDbUrl],
    ['ORDER_DB_URL', orderDbUrl],
    ['DISCOUNT_DB_URL', discountDbUrl],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missingDbVars.length > 0) {
    console.error(`❌ Thiếu biến môi trường DB bắt buộc: ${missingDbVars.join(', ')}`);
    process.exit(1);
  }

  if (isReset) {
    const SAFE_LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', 'mysql', 'csm-mysql']);
    const targets = [
      { name: 'auth', url: authDbUrl },
      { name: 'product', url: productDbUrl },
      { name: 'inventory', url: inventoryDbUrl },
      { name: 'order', url: orderDbUrl },
      { name: 'discount', url: discountDbUrl },
    ].map((t) => {
      const parsed = new URL(t.url);
      return {
        name: t.name,
        host: parsed.hostname || 'localhost',
        database: parsed.pathname.replace(/^\//, ''),
      };
    });

    console.log('\n🎯 MỤC TIÊU CHUẨN BỊ XOÁ (--reset):');
    for (const t of targets) {
      console.log(`  - [${t.name}] host=${t.host} | database=${t.database}`);
    }

    const remoteTargets = targets.filter((t) => !SAFE_LOCAL_HOSTS.has(t.host.toLowerCase()));
    if (remoteTargets.length > 0) {
      console.error('\n🛑 TỪ CHỐI THỰC THI --reset TRÊN REMOTE HOST:');
      for (const rt of remoteTargets) {
        console.error(`  ❌ [${rt.name}] host="${rt.host}" (database="${rt.database}") không nằm trong danh sách cục bộ/Docker an toàn.`);
      }
      if (!forceRemote) {
        console.error('  👉 Nếu bạn thực sự muốn xoá dữ liệu trên remote host, bắt buộc truyền cờ --force-remote và gõ xác nhận thủ công.');
        process.exit(1);
      }
      if (!process.stdin.isTTY) {
        console.error('  ❌ Không có TTY để gõ xác nhận thủ công cho --force-remote. Huỷ bỏ.');
        process.exit(1);
      }
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const typed: string = await new Promise((resolve) => {
        rl.question('⚠️ Gõ chính xác "DELETE REMOTE DATA" để xác nhận xoá dữ liệu remote: ', (ans) => {
          rl.close();
          resolve(ans.trim());
        });
      });
      if (typed !== 'DELETE REMOTE DATA') {
        console.error('🛑 Xác nhận không khớp. Huỷ bỏ thao tác --reset.');
        process.exit(1);
      }
    }
  }

  const authDs = new DataSource({
    type: 'mysql',
    url: authDbUrl,
    entities: [User],
    synchronize: true,
    ssl: authDbUrl.includes('ssl-mode=REQUIRED') ? { rejectUnauthorized: false } : false,
  });

  const productDs = new DataSource({
    type: 'mysql',
    url: productDbUrl,
    entities: [Category, Product],
    synchronize: true,
    ssl: productDbUrl.includes('ssl-mode=REQUIRED') ? { rejectUnauthorized: false } : false,
  });

  const inventoryDs = new DataSource({
    type: 'mysql',
    url: inventoryDbUrl,
    entities: [Branch, Stock, StockTransaction],
    synchronize: true,
    ssl: inventoryDbUrl.includes('ssl-mode=REQUIRED') ? { rejectUnauthorized: false } : false,
  });

  const orderDs = new DataSource({
    type: 'mysql',
    url: orderDbUrl,
    entities: [Order, OrderItem],
    synchronize: true,
    ssl: orderDbUrl.includes('ssl-mode=REQUIRED') ? { rejectUnauthorized: false } : false,
  });

  await authDs.initialize();
  await productDs.initialize();
  await inventoryDs.initialize();
  await orderDs.initialize();

  if (isReset) {
    await handleReset({ authDs, productDs, inventoryDs, orderDs });
    await authDs.destroy();
    await productDs.destroy();
    await inventoryDs.destroy();
    await orderDs.destroy();
    return;
  }

  console.log('======================================================');
  console.log('🚀 BẮT ĐẦU SEED BỘ DỮ LIỆU DEMO ĐỒ ÁN CSM (IDEMPOTENT)');
  console.log('======================================================\n');

  // Lấy mật khẩu từ biến môi trường SEED_PASSWORD (tuyệt đối không in ra log)
  const seedPassword = process.env.SEED_PASSWORD;
  if (!seedPassword) {
    console.error('❌ Thiếu biến môi trường bắt buộc: SEED_PASSWORD');
    process.exit(1);
  }
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(seedPassword, salt);

  // --- BƯỚC 1: SEED TÀI KHOẢN NGƯỜI DÙNG (AUTH DB) ---
  console.log('📌 Bước 1: Khởi tạo/Cập nhật Tài khoản người dùng (Auth DB)...');
  const userRepo = authDs.getRepository(User);

  const seedUsersList = [
    { email: 'admin@csm.vn', role: UserRole.ADMIN, branch_id: null },
    { email: 'manager.q1@csm.vn', role: UserRole.BRANCH_MANAGER, branch_id: 'br-01' },
    { email: 'manager.q2@csm.vn', role: UserRole.BRANCH_MANAGER, branch_id: 'br-02' },
    { email: 'customer1@csm.vn', role: UserRole.CUSTOMER, branch_id: null },
    { email: 'customer2@csm.vn', role: UserRole.CUSTOMER, branch_id: null },
    { email: 'customer@csm.vn', role: UserRole.CUSTOMER, branch_id: null }, // tương thích test cũ
  ];

  let usersCreated = 0;
  let usersUpdated = 0;

  for (const u of seedUsersList) {
    let existing = await userRepo.findOne({ where: { email: u.email } });
    if (existing) {
      existing.password_hash = passwordHash;
      existing.role = u.role;
      existing.branch_id = u.branch_id as any;
      await userRepo.save(existing);
      usersUpdated++;
      console.log(`  🔄 Cập nhật tài khoản: ${u.email} [${u.role}]`);
    } else {
      const newUser = userRepo.create({
        email: u.email,
        password_hash: passwordHash,
        role: u.role,
        branch_id: u.branch_id as any,
      });
      await userRepo.save(newUser);
      usersCreated++;
      console.log(`  ➕ Tạo mới tài khoản: ${u.email} [${u.role}]`);
    }
  }

  // --- BƯỚC 2: SEED CHI NHÁNH (INVENTORY DB) ---
  console.log('\n📌 Bước 2: Khởi tạo/Cập nhật 3 Chi nhánh TP.HCM (Inventory DB)...');
  const branchRepo = inventoryDs.getRepository(Branch);
  let branchesCreated = 0;
  let branchesUpdated = 0;

  for (const b of seedBranches) {
    let branch = await branchRepo.findOne({ where: { id: b.id } });
    if (!branch) {
      branch = branchRepo.create({ ...b, is_active: true });
      await branchRepo.save(branch);
      branchesCreated++;
      console.log(`  ➕ Tạo chi nhánh: [${b.id}] ${b.name}`);
    } else {
      branch.name = b.name;
      branch.address = b.address;
      branch.phone = b.phone;
      branch.latitude = b.latitude;
      branch.longitude = b.longitude;
      branch.is_active = true;
      await branchRepo.save(branch);
      branchesUpdated++;
      console.log(`  🔄 Cập nhật toạ độ chi nhánh: [${b.id}] ${b.name}`);
    }
  }

  // --- BƯỚC 3: SEED DANH MỤC & SẢN PHẨM (PRODUCT DB) ---
  console.log('\n📌 Bước 3: Khởi tạo/Cập nhật 5 Danh mục & 26 Sản phẩm (Product DB)...');
  const catRepo = productDs.getRepository(Category);
  const prodRepo = productDs.getRepository(Product);

  const categoryMap = new Map<string, Category>();
  for (const c of seedCategories) {
    let cat = await catRepo.findOne({ where: { name: c.name } });
    if (!cat) {
      cat = catRepo.create(c);
      await catRepo.save(cat);
      console.log(`  ➕ Tạo danh mục mới: ${cat.name}`);
    } else {
      cat.description = c.description;
      await catRepo.save(cat);
      console.log(`  🔄 Cập nhật danh mục: ${cat.name}`);
    }
    categoryMap.set(cat.name, cat);
  }

  const savedProducts: Product[] = [];
  let prodsCreated = 0;
  let prodsUpdated = 0;

  for (const p of seedProducts) {
    let prod = await prodRepo.findOne({ where: { sku: p.sku }, relations: ['category'] });
    const targetCat = categoryMap.get(p.categoryName);

    if (!prod) {
      prod = prodRepo.create({
        sku: p.sku,
        name: p.name,
        description: p.description,
        base_price: p.base_price,
        category: targetCat,
      });
      await prodRepo.save(prod);
      prodsCreated++;
      console.log(`  ➕ Tạo sản phẩm: [${prod.sku}] ${prod.name} (${Number(prod.base_price).toLocaleString()}đ)`);
    } else {
      prod.name = p.name;
      prod.description = p.description;
      prod.base_price = p.base_price;
      prod.category = targetCat!;
      await prodRepo.save(prod);
      prodsUpdated++;
      console.log(`  🔄 Cập nhật sản phẩm: [${prod.sku}] ${prod.name}`);
    }
    savedProducts.push(prod);
  }

  // --- BƯỚC 4: ĐĂNG NHẬP ADMIN & TẢI ẢNH PLACEHOLDER QUA API POST /products/:id/image ---
  console.log('\n📌 Bước 4: Tải lên ảnh placeholder qua API POST /products/:id/image...');
  let adminToken = '';
  try {
    const loginRes = await axios.post(`${GATEWAY_URL}/auth/login`, {
      email: 'admin@csm.vn',
      password: seedPassword,
    });
    adminToken = loginRes.data.accessToken;
    console.log('  🔑 Đăng nhập tài khoản Admin thành công để cấp quyền tải ảnh.');
  } catch (err: any) {
    console.warn('  ⚠️ Không thể lấy Admin token từ Gateway:', err.message);
  }

  let imagesUploaded = 0;
  let imagesSkipped = 0;

  if (adminToken) {
    for (const prod of savedProducts) {
      // Kiểm tra nếu sản phẩm đã có ảnh local và ảnh đó mở được qua Gateway
      let hasValidLocalImage = false;
      if (prod.image_url && prod.image_url.startsWith('/uploads/')) {
        try {
          const testGet = await axios.get(`${UPLOADS_BASE_URL}${prod.image_url}`, { timeout: 2000 });
          if (testGet.status === 200) {
            hasValidLocalImage = true;
          }
        } catch {
          hasValidLocalImage = false;
        }
      }

      if (hasValidLocalImage) {
        imagesSkipped++;
        continue;
      }

      // Tạo ảnh PNG hợp lệ theo danh mục
      const catName = prod.category?.name || 'Đồ uống & Giải khát';
      const rgb = categoryColorMap[catName] || [78, 159, 118];
      const pngBuf = generatePngBuffer(100, 100, rgb[0], rgb[1], rgb[2]);

      try {
        const blob = new Blob([new Uint8Array(pngBuf)], { type: 'image/png' });
        const formData = new FormData();
        formData.append('image', blob, `${prod.sku}.png`);

        const uploadRes = await fetch(`${GATEWAY_URL}/products/${prod.id}/image`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` },
          body: formData,
        });

        const uploadData: any = await uploadRes.json();
        if (uploadRes.status === 201 && uploadData.image_url) {
          prod.image_url = uploadData.image_url;
          imagesUploaded++;
          console.log(`  🖼️ Đã upload ảnh cho [${prod.sku}]: ${uploadData.image_url}`);
        } else {
          console.warn(`  ⚠️ Upload ảnh cho [${prod.sku}] trả về:`, uploadData);
        }
      } catch (uploadErr: any) {
        console.warn(`  ⚠️ Lỗi khi tải ảnh cho [${prod.sku}]:`, uploadErr.message);
      }
    }
  }

  // --- BƯỚC 5: TỒN KHO CHO CẢ 3 CHI NHÁNH (POST /inventory/add-stock & IDEMPOTENT) ---
  console.log('\n📌 Bước 5: Khởi tạo/Bổ sung tồn kho qua API POST /inventory/add-stock...');
  const stockRepo = inventoryDs.getRepository(Stock);
  const txRepo = inventoryDs.getRepository(StockTransaction);

  let stocksInitialized = 0;
  let stocksSkipped = 0;

  for (const branch of seedBranches) {
    for (const prod of savedProducts) {
      // Kiểm tra xem stock đã tồn tại chưa
      let existingStock = await stockRepo.findOne({
        where: { branch_id: branch.id, product_id: prod.id },
      });

      if (existingStock) {
        stocksSkipped++;
        continue;
      }

      // Xác định số lượng nhập kho ban đầu
      let targetQty = 50; // Mặc định 50 sản phẩm mỗi chi nhánh

      // Cố ý để 2-3 sản phẩm tồn thấp (1-3 cái) để demo
      if (branch.id === 'br-01' && prod.sku === 'SKU-DRK-001') {
        targetQty = 2; // Tồn thấp tại br-01
      } else if (branch.id === 'br-01' && prod.sku === 'SKU-SNK-002') {
        targetQty = 3; // Tồn thấp tại br-01
      } else if (branch.id === 'br-02' && prod.sku === 'SKU-NDL-001') {
        targetQty = 1; // Tồn rất thấp tại br-02
      } else if (branch.id === 'br-02' && prod.sku === 'SKU-NDL-004') {
        targetQty = 0; // Hết hàng tại br-02 để demo cảnh báo vượt tồn
      }

      if (targetQty > 0 && adminToken) {
        try {
          await axios.post(
            `${GATEWAY_URL}/inventory/add-stock`,
            {
              branchId: branch.id,
              productId: prod.id,
              quantity: targetQty,
              referenceId: `seed-demo-${branch.id}-${prod.sku}`,
            },
            {
              headers: { Authorization: `Bearer ${adminToken}` },
            },
          );
          stocksInitialized++;
        } catch (addStockErr: any) {
          // Fallback lưu trực tiếp nếu Gateway bận
          const newStock = stockRepo.create({
            branch_id: branch.id,
            product_id: prod.id,
            quantity: targetQty,
            reserved_quantity: 0,
          });
          const saved = await stockRepo.save(newStock);
          await txRepo.save(
            txRepo.create({
              stock_id: saved.id,
              type: TransactionType.IN,
              quantity: targetQty,
              reference_id: `seed-demo-${branch.id}-${prod.sku}`,
            }),
          );
          stocksInitialized++;
        }
      } else if (targetQty === 0) {
        // Tạo bản ghi tồn kho với số lượng 0 cho kịch bản hết hàng
        const zeroStock = stockRepo.create({
          branch_id: branch.id,
          product_id: prod.id,
          quantity: 0,
          reserved_quantity: 0,
        });
        await stockRepo.save(zeroStock);
        stocksInitialized++;
        console.log(`  ⚠️ Khởi tạo sản phẩm HẾT HÀNG (0 tồn): [${branch.id}] -> [${prod.sku}] ${prod.name}`);
      }
    }
  }

  // --- BƯỚC 6: TẠO 12 ĐƠN HÀNG QUA API THẬT (SAGA & STATE MACHINE NHẤT QUÁN) ---
  console.log('\n📌 Bước 6: Khởi tạo 12 Đơn hàng qua API thật (Saga & State Machine)...');

  // Đăng nhập lấy token cho khách hàng & quản lý chi nhánh
  let cust1Token = '';
  let cust2Token = '';
  let mgr1Token = '';
  let mgr2Token = '';

  try {
    const resC1 = await axios.post(`${GATEWAY_URL}/auth/login`, { email: 'customer1@csm.vn', password: seedPassword });
    cust1Token = resC1.data.accessToken;
    const resC2 = await axios.post(`${GATEWAY_URL}/auth/login`, { email: 'customer2@csm.vn', password: seedPassword });
    cust2Token = resC2.data.accessToken;
    const resM1 = await axios.post(`${GATEWAY_URL}/auth/login`, { email: 'manager.q1@csm.vn', password: seedPassword });
    mgr1Token = resM1.data.accessToken;
    const resM2 = await axios.post(`${GATEWAY_URL}/auth/login`, { email: 'manager.q2@csm.vn', password: seedPassword });
    mgr2Token = resM2.data.accessToken;
  } catch (err: any) {
    console.warn('  ⚠️ Đăng nhập tài khoản demo gặp lỗi:', err.message);
  }

  const orderRepo = orderDs.getRepository(Order);

  // Kiểm tra số lượng đơn hiện tại của khách hàng demo
  const user1 = await userRepo.findOne({ where: { email: 'customer1@csm.vn' } });
  const user2 = await userRepo.findOne({ where: { email: 'customer2@csm.vn' } });

  const existingDemoOrders = await orderRepo.find({
    where: [{ user_id: user1?.id || '' }, { user_id: user2?.id || '' }],
  });

  if (existingDemoOrders.length >= 12) {
    console.log(`  👌 Đã có ${existingDemoOrders.length} đơn hàng demo trong hệ thống. Bỏ qua bước tạo để đảm bảo Idempotent.`);
  } else if (cust1Token && cust2Token) {
    console.log(`  ⏳ Đang tạo 12 đơn hàng demo qua API Gateway...`);

    // Helper tìm product id theo SKU
    const getProdId = (sku: string) => savedProducts.find((p) => p.sku === sku)?.id || savedProducts[0].id;

    // Định nghĩa 12 kịch bản đơn hàng (6 đơn br-01, 6 đơn br-02; đa dạng trạng thái và PTTT)
    const orderScenarios = [
      // --- CHI NHÁNH br-01 (6 đơn) ---
      {
        custToken: cust1Token,
        mgrToken: mgr1Token,
        branchId: 'br-01',
        paymentMethod: 'COD',
        items: [{ productId: getProdId('SKU-DRK-002'), quantity: 2 }],
        targetStatus: 'PENDING',
        daysAgo: 6,
      },
      {
        custToken: cust1Token,
        mgrToken: mgr1Token,
        branchId: 'br-01',
        paymentMethod: 'COD',
        items: [{ productId: getProdId('SKU-SNK-001'), quantity: 1 }, { productId: getProdId('SKU-DRK-003'), quantity: 1 }],
        targetStatus: 'CONFIRMED',
        daysAgo: 5,
      },
      {
        custToken: cust1Token,
        mgrToken: mgr1Token,
        branchId: 'br-01',
        paymentMethod: 'MOMO',
        items: [{ productId: getProdId('SKU-MLK-001'), quantity: 3 }],
        targetStatus: 'CONFIRMED',
        daysAgo: 4,
      },
      {
        custToken: cust1Token,
        mgrToken: mgr1Token,
        branchId: 'br-01',
        paymentMethod: 'MOMO',
        items: [{ productId: getProdId('SKU-SNK-003'), quantity: 1 }, { productId: getProdId('SKU-DRK-004'), quantity: 2 }],
        targetStatus: 'PAID',
        daysAgo: 3,
      },
      {
        custToken: cust1Token,
        mgrToken: mgr1Token,
        branchId: 'br-01',
        paymentMethod: 'COD',
        items: [{ productId: getProdId('SKU-NDL-002'), quantity: 2 }, { productId: getProdId('SKU-PER-001'), quantity: 1 }],
        targetStatus: 'SHIPPED',
        daysAgo: 2,
      },
      {
        custToken: cust1Token,
        mgrToken: mgr1Token,
        branchId: 'br-01',
        paymentMethod: 'COD',
        items: [{ productId: getProdId('SKU-PER-002'), quantity: 1 }],
        targetStatus: 'CANCELLED', // Khách hàng huỷ PENDING -> kiểm chứng Saga release-stock
        daysAgo: 1,
      },

      // --- CHI NHÁNH br-02 (6 đơn) ---
      {
        custToken: cust2Token,
        mgrToken: mgr2Token,
        branchId: 'br-02',
        paymentMethod: 'MOMO',
        items: [{ productId: getProdId('SKU-DRK-005'), quantity: 2 }, { productId: getProdId('SKU-SNK-004'), quantity: 1 }],
        targetStatus: 'PENDING',
        daysAgo: 6,
      },
      {
        custToken: cust2Token,
        mgrToken: mgr2Token,
        branchId: 'br-02',
        paymentMethod: 'COD',
        items: [{ productId: getProdId('SKU-MLK-002'), quantity: 2 }, { productId: getProdId('SKU-NDL-003'), quantity: 1 }],
        targetStatus: 'CONFIRMED',
        daysAgo: 5,
      },
      {
        custToken: cust2Token,
        mgrToken: mgr2Token,
        branchId: 'br-02',
        paymentMethod: 'MOMO',
        items: [{ productId: getProdId('SKU-MLK-003'), quantity: 2 }, { productId: getProdId('SKU-SNK-005'), quantity: 1 }],
        targetStatus: 'PAID',
        daysAgo: 4,
      },
      {
        custToken: cust2Token,
        mgrToken: mgr2Token,
        branchId: 'br-02',
        paymentMethod: 'MOMO',
        items: [{ productId: getProdId('SKU-DRK-006'), quantity: 1 }, { productId: getProdId('SKU-NDL-005'), quantity: 2 }],
        targetStatus: 'PAID',
        daysAgo: 3,
      },
      {
        custToken: cust2Token,
        mgrToken: mgr2Token,
        branchId: 'br-02',
        paymentMethod: 'MOMO',
        items: [{ productId: getProdId('SKU-PER-003'), quantity: 1 }, { productId: getProdId('SKU-MLK-004'), quantity: 2 }],
        targetStatus: 'SHIPPED',
        daysAgo: 2,
      },
      {
        custToken: cust2Token,
        mgrToken: mgr2Token,
        branchId: 'br-02',
        paymentMethod: 'COD',
        items: [{ productId: getProdId('SKU-PER-004'), quantity: 1 }, { productId: getProdId('SKU-DRK-002'), quantity: 1 }],
        targetStatus: 'PAID',
        daysAgo: 1,
      },
    ];

    for (let i = 0; i < orderScenarios.length; i++) {
      const scen = orderScenarios[i];
      try {
        // 1. Tạo đơn hàng qua API
        const createRes = await axios.post(
          `${GATEWAY_URL}/orders`,
          {
            branchId: scen.branchId,
            items: scen.items,
            paymentMethod: scen.paymentMethod,
            shippingAddress: 'Địa chỉ giao hàng demo, TP.HCM',
          },
          {
            headers: { Authorization: `Bearer ${scen.custToken}` },
          },
        );

        const orderId = createRes.data.orderId;
        const paymentUrl = createRes.data.paymentUrl;

        // 2. Chuyển trạng thái theo đúng nghiệp vụ State Machine
        if (scen.targetStatus === 'CANCELLED') {
          // Khách hàng tự huỷ đơn PENDING
          await axios.patch(
            `${GATEWAY_URL}/orders/${orderId}/status`,
            { status: 'CANCELLED' },
            { headers: { Authorization: `Bearer ${scen.custToken}` } },
          );
        } else if (scen.targetStatus === 'CONFIRMED') {
          // Quản lý chi nhánh xác nhận đơn
          await axios.patch(
            `${GATEWAY_URL}/orders/${orderId}/status`,
            { status: 'CONFIRMED' },
            { headers: { Authorization: `Bearer ${scen.mgrToken}` } },
          );
        } else if (scen.targetStatus === 'PAID') {
          if (scen.paymentMethod === 'MOMO' && paymentUrl) {
            // Thanh toán trực tuyến qua cổng mô phỏng
            const urlObj = new URL(paymentUrl);
            const token = urlObj.searchParams.get('token');
            await axios.post(`${GATEWAY_URL}/payments/simulate-success`, {
              orderId,
              token,
            });
          } else {
            // Chuyển PENDING -> CONFIRMED -> PAID (cho đơn COD nếu quản lý thu tiền)
            await axios.patch(
              `${GATEWAY_URL}/orders/${orderId}/status`,
              { status: 'CONFIRMED' },
              { headers: { Authorization: `Bearer ${scen.mgrToken}` } },
            );
            await axios.patch(
              `${GATEWAY_URL}/orders/${orderId}/status`,
              { status: 'PAID' },
              { headers: { Authorization: `Bearer ${scen.mgrToken}` } },
            );
          }
        } else if (scen.targetStatus === 'SHIPPED') {
          // CONFIRMED -> SHIPPED
          await axios.patch(
            `${GATEWAY_URL}/orders/${orderId}/status`,
            { status: 'CONFIRMED' },
            { headers: { Authorization: `Bearer ${scen.mgrToken}` } },
          );
          await axios.patch(
            `${GATEWAY_URL}/orders/${orderId}/status`,
            { status: 'SHIPPED' },
            { headers: { Authorization: `Bearer ${scen.mgrToken}` } },
          );
        }

        // 3. Phân bổ ngày tạo đơn lùi về quá khứ để dashboard demo trực quan
        const pastDate = new Date(Date.now() - scen.daysAgo * 24 * 60 * 60 * 1000 - i * 3600 * 1000);
        await orderRepo.update(orderId, { created_at: pastDate });

        console.log(`  🛒 [Đơn ${i + 1}/12] #${orderId.slice(0, 8)}... | ${scen.branchId} | ${scen.paymentMethod} -> ${scen.targetStatus}`);
      } catch (orderErr: any) {
        console.warn(`  ⚠️ Lỗi khi tạo đơn hàng kịch bản ${i + 1}:`, orderErr.response?.data?.message || orderErr.message);
      }
    }
  }

  // --- BƯỚC 7: IN BẢNG TỔNG KẾT DỮ LIỆU ĐÃ SEED ---
  const finalUsersCount = await userRepo.count();
  const finalBranchesCount = await branchRepo.count();
  const finalCatsCount = await catRepo.count();
  const finalProdsCount = await prodRepo.count();
  const finalStocksCount = await stockRepo.count();
  const finalOrders = await orderRepo.find();

  const ordersByStatus: Record<string, number> = {};
  const ordersByBranch: Record<string, number> = {};
  for (const o of finalOrders) {
    ordersByStatus[o.status] = (ordersByStatus[o.status] || 0) + 1;
    ordersByBranch[o.branch_id] = (ordersByBranch[o.branch_id] || 0) + 1;
  }

  console.log('\n======================================================');
  console.log('📊 TỔNG KẾT TOÀN BỘ BỘ DỮ LIỆU DEMO HỆ THỐNG CSM:');
  console.log('======================================================');
  console.log(`  👤 Tổng số tài khoản (Auth DB):       ${finalUsersCount} tài khoản`);
  console.log(`     (admin@csm.vn, manager.q1@csm.vn, manager.q2@csm.vn, customer1, customer2)`);
  console.log(`  🏢 Tổng số chi nhánh (Inventory DB):  ${finalBranchesCount} chi nhánh (br-01, br-02, br-03)`);
  console.log(`  📂 Tổng số danh mục (Product DB):     ${finalCatsCount} danh mục`);
  console.log(`  📦 Tổng số sản phẩm (Product DB):     ${finalProdsCount} sản phẩm (SKU-DRK, SKU-SNK, SKU-NDL, ...)`);
  console.log(`  🖼️ Ảnh placeholder đã xử lý:          ${imagesUploaded} tải mới, ${imagesSkipped} sẵn có`);
  console.log(`  📊 Bản ghi tồn kho (Inventory DB):    ${finalStocksCount} bản ghi (đủ 3 chi nhánh)`);
  console.log(`  🛒 Tổng số đơn hàng (Order DB):       ${finalOrders.length} đơn hàng`);
  console.log(`     - Phân bổ theo trạng thái:`, ordersByStatus);
  console.log(`     - Phân bổ theo chi nhánh:  `, ordersByBranch);
  console.log('======================================================');
  console.log('🎉 SEED DỮ LIỆU DEMO HOÀN TẤT THÀNH CÔNG VÀ IDEMPOTENT!\n');

  await authDs.destroy();
  await productDs.destroy();
  await inventoryDs.destroy();
  await orderDs.destroy();
}

runSeed().catch((err) => {
  console.error('❌ Lỗi khi thực thi seed:', err);
  process.exit(1);
});
