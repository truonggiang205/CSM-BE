const mysql = require('mysql2/promise');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

function uuid() {
  return crypto.randomUUID();
}

async function seedInventoryStatuses() {
  console.log('=== BẮT ĐẦU SEED TRẠNG THÁI SẮP HẾT VÀ ĐÃ HẾT VÀO CSDL TỒN KHO ===\n');

  const invUrl = process.env.INVENTORY_DB_URL || 'mysql://root:12345@localhost:3306/csm_inventory';
  const prodUrl = process.env.PRODUCT_DB_URL || 'mysql://root:12345@localhost:3306/csm_product';

  const invConn = await mysql.createConnection(invUrl);
  const prodConn = await mysql.createConnection(prodUrl);

  // 1. Lấy danh sách toàn bộ sản phẩm và chi nhánh
  const [branches] = await invConn.query('SELECT * FROM branches ORDER BY id ASC');
  const [products] = await prodConn.query('SELECT id, name, sku, base_price FROM products ORDER BY sku ASC');

  console.log(`Tìm thấy ${branches.length} chi nhánh và ${products.length} sản phẩm.`);

  // Lấy các stock hiện có
  const [existingStocks] = await invConn.query('SELECT * FROM stocks');
  const stockMap = new Map();
  for (const s of existingStocks) {
    stockMap.set(`${s.branch_id}:${s.product_id}`, s);
  }

  // Cấu hình cụ thể cho 5 sản phẩm nổi bật nhất ở từng chi nhánh để demo trực quan nhất
  const highlightedConfig = {
    // br-01: CSM Bến Nghé - Quận 1
    'br-01': {
      'SKU-BB-003': { qty: 0, res: 0, note: 'Đã hết (0 khả dụng)' }, // Bánh Bao Xá Xíu
      'SKU-MT-004': { qty: 2, res: 2, note: 'Đã hết (2 tồn, 2 giữ chỗ)' }, // Mì Trộn Cay Indomie
      'SKU-TS-001': { qty: 4, res: 1, note: 'Sắp hết (3 khả dụng, 1 giữ)' }, // Trà Sữa Trân Châu
      'SKU-CF-002': { qty: 2, res: 0, note: 'Sắp hết (2 khả dụng)' }, // Cà Phê Sữa Đá
      'SKU-SN-005': { qty: 85, res: 2, note: 'Còn hàng' }, // Snack Khoai Tây
    },
    // br-02: CSM Phú Mỹ Hưng - Quận 7
    'br-02': {
      'SKU-CF-002': { qty: 0, res: 0, note: 'Đã hết (0 khả dụng)' },
      'SKU-SN-005': { qty: 3, res: 3, note: 'Đã hết (3 giữ chỗ)' },
      'SKU-BB-003': { qty: 3, res: 0, note: 'Sắp hết (3 khả dụng)' },
      'SKU-MT-004': { qty: 5, res: 1, note: 'Sắp hết (4 khả dụng)' },
      'SKU-TS-001': { qty: 90, res: 0, note: 'Còn hàng' },
    },
    // br-03: CSM Hàng Xanh - Bình Thạnh
    'br-03': {
      'SKU-TS-001': { qty: 0, res: 0, note: 'Đã hết (0 khả dụng)' },
      'SKU-SN-005': { qty: 1, res: 0, note: 'Sắp hết (1 khả dụng)' },
      'SKU-CF-002': { qty: 4, res: 0, note: 'Sắp hết (4 khả dụng)' },
      'SKU-MT-004': { qty: 0, res: 0, note: 'Đã hết (0 khả dụng)' },
      'SKU-BB-003': { qty: 75, res: 0, note: 'Còn hàng' },
    },
  };

  let totalUpdated = 0;
  let totalInserted = 0;
  let totalTx = 0;

  for (let bIdx = 0; bIdx < branches.length; bIdx++) {
    const branch = branches[bIdx];
    console.log(`\n--- Xử lý chi nhánh [${branch.id}] ${branch.name} ---`);
    const branchSpecial = highlightedConfig[branch.id] || {};

    let outCount = 0;
    let lowCount = 0;
    let inCount = 0;

    for (let pIdx = 0; pIdx < products.length; pIdx++) {
      const prod = products[pIdx];
      const key = `${branch.id}:${prod.id}`;
      const existing = stockMap.get(key);

      let targetQty = 50;
      let targetRes = 0;

      // 1. Kiểm tra cấu hình ưu tiên đặc biệt theo SKU
      if (branchSpecial[prod.sku]) {
        targetQty = branchSpecial[prod.sku].qty;
        targetRes = branchSpecial[prod.sku].res;
      } else {
        // Phân bổ tỉ lệ theo vị trí (offset theo chi nhánh để mỗi chi nhánh phong phú khác nhau)
        const adjustedIdx = (pIdx + bIdx * 19) % products.length;

        if (adjustedIdx < 11) {
          // Trạng thái ĐÃ HẾT (available = 0): 11 sản phẩm
          if (adjustedIdx % 3 === 0) {
            // Có tồn nhưng bị giữ chỗ hết => available = 0
            const reserved = (adjustedIdx % 2) + 1;
            targetQty = reserved;
            targetRes = reserved;
          } else {
            // Tồn = 0, Giữ chỗ = 0
            targetQty = 0;
            targetRes = 0;
          }
        } else if (adjustedIdx < 26) {
          // Trạng thái SẮP HẾT (available từ 1 đến 5): 15 sản phẩm
          const lowVariant = adjustedIdx % 5;
          switch (lowVariant) {
            case 0:
              targetQty = 1;
              targetRes = 0;
              break;
            case 1:
              targetQty = 2;
              targetRes = 0;
              break;
            case 2:
              targetQty = 3;
              targetRes = 0;
              break;
            case 3:
              targetQty = 5;
              targetRes = 1; // available = 4
              break;
            case 4:
              targetQty = 5;
              targetRes = 0; // available = 5
              break;
          }
        } else {
          // Trạng thái CÒN HÀNG (> 5 sản phẩm)
          targetQty = 20 + ((adjustedIdx * 11) % 180);
          targetRes = (adjustedIdx % 7 === 0) ? 2 : 0;
        }
      }

      const available = Math.max(0, targetQty - targetRes);
      if (available <= 0) outCount++;
      else if (available <= 5) lowCount++;
      else inCount++;

      const now = new Date();

      if (existing) {
        // Cập nhật stock hiện có
        await invConn.query(
          'UPDATE stocks SET quantity = ?, reserved_quantity = ?, updated_at = ? WHERE id = ?',
          [targetQty, targetRes, now, existing.id]
        );
        totalUpdated++;

        // Ghi transaction điều chỉnh nếu có thay đổi
        if (existing.quantity !== targetQty) {
          const diff = targetQty - existing.quantity;
          await invConn.query(
            'INSERT INTO stock_transactions (id, stock_id, type, quantity, reference_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [
              uuid(),
              existing.id,
              diff >= 0 ? 'IN' : 'OUT',
              Math.abs(diff),
              `ADJUST-STATUS-${branch.id}-${prod.sku}`,
              now,
            ]
          );
          totalTx++;
        }
      } else {
        // Tạo mới bản ghi tồn kho
        const stockId = uuid();
        await invConn.query(
          'INSERT INTO stocks (id, product_id, branch_id, quantity, reserved_quantity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [stockId, prod.id, branch.id, targetQty, targetRes, now, now]
        );
        totalInserted++;

        // Ghi transaction IN ban đầu
        await invConn.query(
          'INSERT INTO stock_transactions (id, stock_id, type, quantity, reference_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [
            uuid(),
            stockId,
            'IN',
            targetQty,
            `SEED-STATUS-INIT-${branch.id}-${prod.sku}`,
            now,
          ]
        );
        totalTx++;
      }
    }

    console.log(`  -> Đã hết (available = 0): ${outCount} sản phẩm`);
    console.log(`  -> Sắp hết (available 1-5): ${lowCount} sản phẩm`);
    console.log(`  -> Còn hàng (available > 5): ${inCount} sản phẩm`);
    console.log(`  -> Tổng SKU tại chi nhánh: ${products.length} sản phẩm`);
  }

  console.log('\n======================================================');
  console.log(`Hoàn tất! Đã cập nhật ${totalUpdated} dòng stock, thêm mới ${totalInserted} dòng stock.`);
  console.log(`Đã ghi thêm ${totalTx} bản ghi lịch sử vào stock_transactions.`);
  console.log('======================================================\n');

  await invConn.end();
  await prodConn.end();
}

seedInventoryStatuses().catch((err) => {
  console.error('Lỗi khi seed tồn kho:', err);
  process.exit(1);
});

