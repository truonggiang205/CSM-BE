const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

function uuid() {
  return crypto.randomUUID();
}

async function seed() {
  console.log('--- STARTING COMPREHENSIVE SEEDING (87 RECORDS PER MODULE) ---');

  // Connections
  const authConn = await mysql.createConnection('mysql://root:12345@localhost:3306/csm_auth');
  const prodConn = await mysql.createConnection('mysql://root:12345@localhost:3306/csm_product');
  const invConn = await mysql.createConnection('mysql://root:12345@localhost:3306/csm_inventory');
  const orderConn = await mysql.createConnection('mysql://root:12345@localhost:3306/csm_order');

  const branches = ['br-01', 'br-02', 'br-03'];

  // Check current counts
  const userCount = (await authConn.query('SELECT COUNT(*) as c FROM users'))[0][0].c;
  const prodCount = (await prodConn.query('SELECT COUNT(*) as c FROM products'))[0][0].c;
  console.log(`Current users: ${userCount}, products: ${prodCount}`);

  // Fetch all user IDs for orders
  const allUserIds = (await authConn.query('SELECT id FROM users'))[0].map(u => u.id);
  // Fetch all product records from DB
  const allProds = (await prodConn.query('SELECT id, name, base_price FROM products'))[0];

  // 3. SEED 87 INVENTORY STOCKS (Unique product_id + branch_id)
  console.log('Seeding 87 inventory stocks into csm_inventory.stocks...');
  const existingStocks = (await invConn.query('SELECT product_id, branch_id FROM stocks'))[0];
  const existingSet = new Set(existingStocks.map(s => `${s.product_id}-${s.branch_id}`));

  let insertedStocks = 0;
  for (const p of allProds) {
    if (insertedStocks >= 87) break;
    for (const bId of branches) {
      if (insertedStocks >= 87) break;
      const key = `${p.id}-${bId}`;
      if (existingSet.has(key)) continue;

      const stockId = uuid();
      let quantity = 50 + (insertedStocks * 7) % 250;
      let reserved = (insertedStocks % 5 === 0) ? 2 : 0;
      
      // Phân bổ trạng thái Đã hết (available = 0) và Sắp hết (available 1-5)
      if (insertedStocks % 9 === 0) {
        quantity = 0;
        reserved = 0;
      } else if (insertedStocks % 9 === 3) {
        quantity = 2;
        reserved = 2;
      } else if (insertedStocks % 9 === 1) {
        quantity = 2;
        reserved = 0;
      } else if (insertedStocks % 9 === 2) {
        quantity = 4;
        reserved = 1;
      } else if (insertedStocks % 9 === 4) {
        quantity = 5;
        reserved = 0;
      }

      const createdAt = new Date();

      await invConn.query(
        'INSERT INTO stocks (id, product_id, branch_id, quantity, reserved_quantity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [stockId, p.id, bId, quantity, reserved, createdAt, createdAt]
      );

      // Stock transaction IN
      await invConn.query(
        'INSERT INTO stock_transactions (id, stock_id, type, quantity, reference_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [uuid(), stockId, 'IN', quantity, `INIT-STOCK-${bId}-${insertedStocks + 1}`, createdAt]
      );

      existingSet.add(key);
      insertedStocks++;
    }
  }
  const totalStocks = (await invConn.query('SELECT COUNT(*) as c FROM stocks'))[0][0].c;
  console.log(`Inserted ${insertedStocks} stocks. Total stocks in DB: ${totalStocks}`);

  // 4. SEED 87 ORDERS & ORDER_ITEMS
  console.log('Seeding 87 orders into csm_order.orders & order_items...');
  const paymentMethods = ['MOMO', 'ZALOPAY', 'COD', 'ATM'];
  const orderStatuses = ['PENDING', 'CONFIRMED', 'PAID', 'SHIPPED', 'CANCELLED'];

  for (let i = 1; i <= 87; i++) {
    const orderId = uuid();
    const userId = allUserIds[i % allUserIds.length];
    const branchId = branches[i % branches.length];
    const paymentMethod = paymentMethods[i % paymentMethods.length];
    // Distribute realistic statuses: 45% SHIPPED, 25% PAID, 15% CONFIRMED, 10% PENDING, 5% CANCELLED
    const rand = Math.random();
    const status = rand < 0.45 ? 'SHIPPED' : rand < 0.70 ? 'PAID' : rand < 0.85 ? 'CONFIRMED' : rand < 0.95 ? 'PENDING' : 'CANCELLED';

    // Random order date in last 30 days
    const daysAgo = Math.floor(Math.random() * 30);
    const hoursAgo = Math.floor(Math.random() * 24);
    const orderDate = new Date(Date.now() - (daysAgo * 86400000 + hoursAgo * 3600000));

    // Choose 1 to 3 items
    const itemCount = 1 + (i % 3);
    const items = [];
    let totalAmount = 0;

    for (let j = 0; j < itemCount; j++) {
      const prod = allProds[(i * 3 + j) % allProds.length];
      const qty = 1 + ((i + j) % 3);
      const unitPrice = parseFloat(prod.base_price);
      totalAmount += unitPrice * qty;

      items.push({
        id: uuid(),
        productId: prod.id,
        name: prod.name,
        price: unitPrice,
        quantity: qty,
      });
    }

    // Insert order
    await orderConn.query(
      'INSERT INTO orders (id, user_id, branch_id, total_amount, payment_method, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [orderId, userId, branchId, totalAmount, paymentMethod, status, orderDate, orderDate]
    );

    // Insert order items
    for (const item of items) {
      await orderConn.query(
        'INSERT INTO order_items (id, product_id, product_name_snapshot, price_snapshot, quantity, created_at, order_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [item.id, item.productId, item.name, item.price, item.quantity, orderDate, orderId]
      );
    }
  }

  const finalOrderCount = (await orderConn.query('SELECT COUNT(*) as c FROM orders'))[0][0].c;
  const finalItemCount = (await orderConn.query('SELECT COUNT(*) as c FROM order_items'))[0][0].c;
  console.log(`Inserted 87 orders. Total orders in DB: ${finalOrderCount}, items: ${finalItemCount}`);

  await authConn.end();
  await prodConn.end();
  await invConn.end();
  await orderConn.end();

  console.log('--- ALL 87 RECORDS PER MODULE SEEDED SUCCESSFULLY! ---');
}

seed().catch(err => {
  console.error('Seeding error:', err);
  process.exit(1);
});
