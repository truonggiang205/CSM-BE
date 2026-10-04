import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Entities
import { Category } from '../apps/product-service/src/entities/category.entity';
import { Product } from '../apps/product-service/src/entities/product.entity';
import { Branch } from '../apps/inventory-service/src/entities/branch.entity';
import { Stock } from '../apps/inventory-service/src/entities/stock.entity';
import { StockTransaction, TransactionType } from '../apps/inventory-service/src/entities/stock-transaction.entity';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const seedBranches = [
  {
    id: 'br-01', // Khớp với branch_id của manager.q1@csm.vn
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
    name: 'Đồ uống & Trà sữa',
    description: 'Các loại trà sữa, cà phê, nước giải khát thơm ngon mát lạnh',
  },
  {
    name: 'Thức ăn nhanh',
    description: 'Bánh bao, sandwich, cơm nắm, mì trộn chuẩn vị tiện lợi',
  },
  {
    name: 'Bánh kẹo & Snack',
    description: 'Snack khoai tây, rong biển, bánh quy và kẹo ngậm',
  },
];

const seedProducts = [
  {
    sku: 'SKU-TS-001',
    name: 'Trà Sữa Trân Châu CSM',
    description: 'Trà sữa đậm vị hồng trà truyền thống cùng trân châu đen dai giòn',
    base_price: 35000,
    categoryName: 'Đồ uống & Trà sữa',
    image_url: 'https://images.unsplash.com/photo-1558857563-b37cf5a1a196?w=500&auto=format&fit=crop',
  },
  {
    sku: 'SKU-CF-002',
    name: 'Cà Phê Sữa Đá Sài Gòn',
    description: 'Cà phê Robusta đậm đặc pha cùng sữa đặc thơm béo chuẩn vị Sài Gòn',
    base_price: 25000,
    categoryName: 'Đồ uống & Trà sữa',
    image_url: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=500&auto=format&fit=crop',
  },
  {
    sku: 'SKU-BB-003',
    name: 'Bánh Bao Xá Xíu Phô Mai',
    description: 'Bánh bao nóng hổi nhân thịt xá xíu đậm đà kết hợp phô mai kéo sợi',
    base_price: 22000,
    categoryName: 'Thức ăn nhanh',
    image_url: 'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=500&auto=format&fit=crop',
  },
  {
    sku: 'SKU-MT-004',
    name: 'Mì Trộn Cay Indomie Trứng Lòng Đào',
    description: 'Mì trộn cay giòn sốt đặc biệt kèm xúc xích và trứng ốp la lòng đào',
    base_price: 30000,
    categoryName: 'Thức ăn nhanh',
    image_url: 'https://images.unsplash.com/photo-1612927601601-6638404737ce?w=500&auto=format&fit=crop',
  },
  {
    sku: 'SKU-SN-005',
    name: 'Snack Khoai Tây Vị Tảo Biển',
    description: 'Khoai tây sấy giòn rụm tẩm vị rong biển Nhật Bản tự nhiên',
    base_price: 18000,
    categoryName: 'Bánh kẹo & Snack',
    image_url: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=500&auto=format&fit=crop',
  },
];

async function runSeed() {
  console.log('🚀 Bắt đầu chạy Seed dữ liệu Idempotent cho Hệ Thống CSM...');

  // --- 1. SEED PRODUCT DATABASE (Categories & Products) ---
  const productDbUrl = process.env.PRODUCT_DB_URL;
  if (!productDbUrl) {
    throw new Error('PRODUCT_DB_URL không tìm thấy trong file .env');
  }

  const productDs = new DataSource({
    type: 'mysql',
    url: productDbUrl,
    entities: [Category, Product],
    synchronize: true,
    ssl: { rejectUnauthorized: false },
  });

  await productDs.initialize();
  console.log('✅ Đã kết nối csm_product Database.');

  const categoryRepo = productDs.getRepository(Category);
  const productRepo = productDs.getRepository(Product);

  const categoryMap = new Map<string, Category>();

  for (const c of seedCategories) {
    let cat = await categoryRepo.findOne({ where: { name: c.name } });
    if (!cat) {
      cat = categoryRepo.create(c);
      await categoryRepo.save(cat);
      console.log(`  ➕ Tạo danh mục mới: ${cat.name}`);
    } else {
      cat.description = c.description;
      await categoryRepo.save(cat);
      console.log(`  🔄 Cập nhật danh mục: ${cat.name}`);
    }
    categoryMap.set(cat.name, cat);
  }

  const savedProducts: Product[] = [];
  for (const p of seedProducts) {
    let prod = await productRepo.findOne({ where: { sku: p.sku }, relations: ['category'] });
    const targetCat = categoryMap.get(p.categoryName);

    if (!prod) {
      prod = productRepo.create({
        sku: p.sku,
        name: p.name,
        description: p.description,
        base_price: p.base_price,
        image_url: p.image_url,
        category: targetCat,
      });
      await productRepo.save(prod);
      console.log(`  ➕ Tạo sản phẩm mới: [${prod.sku}] ${prod.name}`);
    } else {
      prod.name = p.name;
      prod.description = p.description;
      prod.base_price = p.base_price;
      prod.image_url = p.image_url;
      prod.category = targetCat!;
      await productRepo.save(prod);
      console.log(`  🔄 Cập nhật sản phẩm: [${prod.sku}] ${prod.name}`);
    }
    savedProducts.push(prod);
  }

  // --- 2. SEED INVENTORY DATABASE (Branches & Stocks) ---
  const inventoryDbUrl = process.env.INVENTORY_DB_URL;
  if (!inventoryDbUrl) {
    throw new Error('INVENTORY_DB_URL không tìm thấy trong file .env');
  }

  const inventoryDs = new DataSource({
    type: 'mysql',
    url: inventoryDbUrl,
    entities: [Branch, Stock, StockTransaction],
    synchronize: true,
    ssl: { rejectUnauthorized: false },
  });

  await inventoryDs.initialize();
  console.log('✅ Đã kết nối csm_inventory Database.');

  const branchRepo = inventoryDs.getRepository(Branch);
  const stockRepo = inventoryDs.getRepository(Stock);
  const txRepo = inventoryDs.getRepository(StockTransaction);

  const savedBranches: Branch[] = [];
  for (const b of seedBranches) {
    let branch = await branchRepo.findOne({ where: { id: b.id } });
    if (!branch) {
      branch = branchRepo.create({
        id: b.id,
        name: b.name,
        address: b.address,
        phone: b.phone,
        latitude: b.latitude,
        longitude: b.longitude,
        is_active: true,
      });
      await branchRepo.save(branch);
      console.log(`  ➕ Tạo chi nhánh mới: [${branch.id}] ${branch.name} (${branch.latitude}, ${branch.longitude})`);
    } else {
      branch.name = b.name;
      branch.address = b.address;
      branch.phone = b.phone;
      branch.latitude = b.latitude;
      branch.longitude = b.longitude;
      branch.is_active = true;
      await branchRepo.save(branch);
      console.log(`  🔄 Cập nhật chi nhánh: [${branch.id}] ${branch.name} (Toạ độ thật TP.HCM cập nhật)`);
    }
    savedBranches.push(branch);
  }

  // Khởi tạo tồn kho ban đầu (100 đơn vị cho mỗi sản phẩm tại mỗi chi nhánh)
  for (const branch of savedBranches) {
    for (const prod of savedProducts) {
      let stock = await stockRepo.findOne({
        where: { branch_id: branch.id, product_id: prod.id },
      });

      if (!stock) {
        stock = stockRepo.create({
          branch_id: branch.id,
          product_id: prod.id,
          quantity: 100,
          reserved_quantity: 0,
        });
        await stockRepo.save(stock);

        // Ghi nhận bản ghi nhập kho ban đầu (StockTransaction type IN)
        const initTx = txRepo.create({
          stock_id: stock.id,
          type: TransactionType.IN,
          quantity: 100,
          reference_id: `seed-init-${branch.id}-${prod.sku}`,
        });
        await txRepo.save(initTx);
        console.log(`    📦 Nhập kho ban đầu: Chi nhánh ${branch.id} -> Sản phẩm ${prod.name} (Số lượng: 100)`);
      } else {
        console.log(`    👌 Tồn kho đã sẵn sàng: Chi nhánh ${branch.id} -> ${prod.name} (Tồn hiện tại: ${stock.quantity})`);
      }
    }
  }

  await productDs.destroy();
  await inventoryDs.destroy();

  console.log('\n======================================================');
  console.log('🎉 SEED DỮ LIỆU GIAI ĐOẠN B THÀNH CÔNG VÀ IDEMPOTENT!');
  console.log('======================================================\n');
}

runSeed().catch((err) => {
  console.error('❌ Lỗi khi thực thi seed:', err);
  process.exit(1);
});
