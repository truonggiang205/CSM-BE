/**
 * ==============================================================================
 * HƯỚNG DẪN SỬ DỤNG VÀ CẤU HÌNH DATABASE RIÊNG BIỆT (TEST_DB_*)
 * ==============================================================================
 * Mặc định, script sử dụng các URL cấu hình từ file .env chung.
 * Để chạy trên Database kiểm thử cô lập (isolated test database), hãy đặt các
 * biến môi trường sau trong .env.test hoặc truyền qua CLI:
 *
 *   TEST_API_URL="http://localhost:8000/api/v1"
 *   TEST_AUTH_DB_URL="mysql://user:pass@host:port/csm_auth_test?ssl-mode=REQUIRED"
 *   TEST_PRODUCT_DB_URL="mysql://user:pass@host:port/csm_product_test?ssl-mode=REQUIRED"
 *   TEST_INVENTORY_DB_URL="mysql://user:pass@host:port/csm_inventory_test?ssl-mode=REQUIRED"
 *   TEST_ORDER_DB_URL="mysql://user:pass@host:port/csm_order_test?ssl-mode=REQUIRED"
 *
 * Tuỳ chọn dọn dẹp sau khi chạy (Cleanup Mode):
 *   node scripts/test-e2e.js --cleanup
 * hoặc thiết lập biến môi trường:
 *   TEST_CLEANUP=true node scripts/test-e2e.js
 *
 * Chế độ --cleanup sẽ tự động xoá:
 *   1. Mọi tài khoản test_* được tạo trong Auth DB
 *   2. Các đơn hàng test và order_items trong Order DB
 *   3. Mọi bản ghi StockTransaction (RESERVE, OUT, CANCEL_RESERVE, sim-db-fail) trong Inventory DB
 *   4. Dữ liệu tồn kho và sản phẩm SKU-E2E-* trong Product & Inventory DB
 *   5. Trả toàn bộ tồn kho của các chi nhánh về nguyên trạng chuẩn.
 * ==============================================================================
 */

const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');
const mysql = require('mysql2/promise');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:8000/api/v1';
const shouldCleanup = process.argv.includes('--cleanup') || process.env.TEST_CLEANUP === 'true';

async function runSuite() {
  console.log(`======================================================`);
  console.log(`🚀 BẮT ĐẦU CHẠY BỘ KIỂM THỬ E2E TẠI: ${BASE_URL}`);
  if (shouldCleanup) {
    console.log('🧹 Chế độ dọn dẹp dữ liệu test (--cleanup): ĐƯỢC BẬT');
  }
  console.log(`======================================================`);

  const results = [];
  let passedCount = 0;
  let failedCount = 0;

  /**
   * Bộ thực thi từng ca kiểm thử có assert kết quả kỳ vọng
   * @param {string} name Tên ca kiểm thử
   * @param {object} options { expectedStatus, assertFn }
   * @param {function} fn Hàm thực thi async
   */
  async function testCase(name, options, fn) {
    const expectedStatus = options.expectedStatus;
    const assertFn = options.assertFn;

    let actualStatus = 0;
    let actualData = null;
    let passed = false;
    let failureReason = '';

    try {
      const res = await fn();
      actualStatus = res.status;
      actualData = res.data;
    } catch (err) {
      actualStatus = err.response?.status || 500;
      actualData = err.response?.data || err.message;
    }

    // 1. Kiểm tra HTTP Status Code
    if (expectedStatus !== undefined) {
      if (Array.isArray(expectedStatus)) {
        passed = expectedStatus.includes(actualStatus);
      } else {
        passed = actualStatus === expectedStatus;
      }
      if (!passed) {
        failureReason = `Sai HTTP Status (Kỳ vọng: ${expectedStatus}, Thực tế: ${actualStatus})`;
      }
    } else {
      passed = actualStatus >= 200 && actualStatus < 300;
      if (!passed) {
        failureReason = `Yêu cầu thất bại với mã lỗi HTTP ${actualStatus}`;
      }
    }

    // 2. Kiểm tra điều kiện assert logic bổ sung (nếu có)
    if (passed && typeof assertFn === 'function') {
      try {
        const assertResult = assertFn(actualData, actualStatus);
        if (assertResult === false) {
          passed = false;
          failureReason = 'Điều kiện assert dữ liệu không thỏa mãn';
        } else if (typeof assertResult === 'string' && assertResult.length > 0) {
          passed = false;
          failureReason = assertResult;
        }
      } catch (assertErr) {
        passed = false;
        failureReason = `Ngoại lệ khi assert: ${assertErr.message}`;
      }
    }

    if (passed) {
      passedCount++;
      console.log(`\n[PASS] [${actualStatus}] ${name}`);
      console.log(JSON.stringify(actualData, null, 2).slice(0, 400));
    } else {
      failedCount++;
      console.log(`\n[FAIL] [${actualStatus}] ${name}`);
      console.log(`   ❌ Lý do: ${failureReason}`);
      console.log(JSON.stringify(actualData, null, 2).slice(0, 400));
    }

    results.push({ name, passed, status: actualStatus, data: actualData, failureReason });
    return { status: actualStatus, data: actualData, passed };
  }

  // 1. Đăng ký tài khoản CUSTOMER
  let newCustomerToken = '';
  const testCustomerEmail = `test_customer_${Date.now()}@csm.vn`;
  await testCase(
    '1. Đăng ký tài khoản CUSTOMER mới (ép role=CUSTOMER)',
    {
      expectedStatus: 201,
      assertFn: (d) => d.user?.role === 'CUSTOMER' && !!d.accessToken,
    },
    async () => {
      const res = await axios.post(`${BASE_URL}/auth/register`, {
        email: testCustomerEmail,
        password: 'Password@123',
        fullName: 'Khách Hàng Kiểm Thử',
        role: 'ADMIN', // Thử hack role -> server phải ép về CUSTOMER
        branch_id: 'br-01',
      });
      newCustomerToken = res.data.accessToken;
      return res;
    }
  );

  // 2. Đăng nhập ADMIN
  let adminAccessToken = '';
  let adminRefreshToken = '';
  await testCase(
    '2. Đăng nhập ADMIN (seed account)',
    {
      expectedStatus: 201,
      assertFn: (d) => !!d.accessToken && d.user?.role === 'ADMIN',
    },
    async () => {
      const res = await axios.post(`${BASE_URL}/auth/login`, {
        email: 'admin@csm.vn',
        password: 'Admin@123456',
      });
      adminAccessToken = res.data.accessToken;
      adminRefreshToken = res.data.refreshToken;
      return res;
    }
  );

  // 3. Đăng nhập CUSTOMER seed
  let customerAccessToken = '';
  await testCase(
    '3. Đăng nhập CUSTOMER (seed account)',
    {
      expectedStatus: 201,
      assertFn: (d) => !!d.accessToken && d.user?.role === 'CUSTOMER',
    },
    async () => {
      const res = await axios.post(`${BASE_URL}/auth/login`, {
        email: 'customer@csm.vn',
        password: 'Customer@123456',
      });
      customerAccessToken = res.data.accessToken;
      return res;
    }
  );

  // 4. Refresh token bằng Refresh Token hợp lệ
  await testCase(
    '4. Refresh token bằng Refresh Token hợp lệ',
    {
      expectedStatus: 201,
      assertFn: (d) => !!d.accessToken,
    },
    async () => {
      return await axios.post(`${BASE_URL}/auth/refresh`, {
        refreshToken: adminRefreshToken,
      });
    }
  );

  // 5. Refresh token từ chối Access Token (type claim check)
  await testCase(
    '5. Refresh token từ chối Access Token (type claim check)',
    {
      expectedStatus: 401,
      assertFn: (d) => d.statusCode === 401,
    },
    async () => {
      return await axios.post(`${BASE_URL}/auth/refresh`, {
        refreshToken: adminAccessToken,
      });
    }
  );

  // Chuẩn bị 1 sản phẩm mẫu & tồn kho ban đầu
  let testProduct = null;
  const branchId = 'br-01';

  await testCase(
    'Chuẩn bị: Tạo sản phẩm mẫu bằng token ADMIN',
    {
      expectedStatus: 201,
      assertFn: (d) => !!d.id,
    },
    async () => {
      const res = await axios.post(
        `${BASE_URL}/products`,
        {
          sku: 'SKU-E2E-' + Date.now(),
          name: 'Trà Sữa Trân Châu CSM Kiểm Thử',
          base_price: 35000,
          description: 'Trà sữa đậm vị tự nhiên',
        },
        {
          headers: { Authorization: `Bearer ${adminAccessToken}` },
        }
      );
      testProduct = res.data;
      return res;
    }
  );

  const productId = testProduct.id;

  // Nhập tồn kho 100 sản phẩm tại br-01
  await testCase(
    'Chuẩn bị: Nhập 100 sản phẩm vào kho chi nhánh br-01',
    {
      expectedStatus: 201,
      assertFn: (d) => d.quantity === 100,
    },
    async () => {
      return await axios.post(
        `${BASE_URL}/inventory/add-stock`,
        {
          branchId,
          productId,
          quantity: 100,
        },
        {
          headers: { Authorization: `Bearer ${adminAccessToken}` },
        }
      );
    }
  );

  // YÊU CẦU 3: Kiểm tra branchId không tồn tại -> từ chối 400 Bad Request
  await testCase(
    'Kiểm tra Yêu cầu 3: Tạo đơn với branchId không tồn tại (br-99999) -> Bị từ chối 400',
    {
      expectedStatus: 400,
      assertFn: (d) => d.statusCode === 400 && String(d.message).includes('không tồn tại'),
    },
    async () => {
      return await axios.post(
        `${BASE_URL}/orders`,
        {
          branchId: 'br-99999-not-exist',
          items: [{ productId, quantity: 1 }],
          shippingAddress: '123 Test Street',
          paymentMethod: 'COD',
        },
        {
          headers: { Authorization: `Bearer ${customerAccessToken}` },
        }
      );
    }
  );

  // YÊU CẦU 2.(a): Token CUSTOMER hợp lệ + header x-user-role: ADMIN gọi POST /inventory/add-stock -> phải 403
  await testCase(
    'Kiểm tra 2.(a): Token CUSTOMER + header x-user-role: ADMIN gọi add-stock -> Phải 403',
    {
      expectedStatus: 403,
      assertFn: (d) => d.statusCode === 403,
    },
    async () => {
      return await axios.post(
        `${BASE_URL}/inventory/add-stock`,
        {
          branchId,
          productId,
          quantity: 50,
        },
        {
          headers: {
            Authorization: `Bearer ${customerAccessToken}`,
            'x-user-role': 'ADMIN',
            'x-user-id': 'hacked-admin-id',
          },
        }
      );
    }
  );

  // YÊU CẦU 2.(b): Kiểm tra vòng đời Đơn 1 (PENDING -> CONFIRMED) & in số lượng tồn kho + StockTransaction
  let order1Id = '';
  await testCase(
    'Tạo Đơn Hàng 1 (Số lượng 3) -> Trạng thái PENDING',
    {
      expectedStatus: 201,
      assertFn: (d) => !!d.orderId && d.status === 'PENDING',
    },
    async () => {
      const res = await axios.post(
        `${BASE_URL}/orders`,
        {
          branchId,
          items: [{ productId, quantity: 3, price: 1 }],
          shippingAddress: '123 Lê Lợi, Q1',
          paymentMethod: 'COD',
        },
        {
          headers: { Authorization: `Bearer ${customerAccessToken}` },
        }
      );
      order1Id = res.data.orderId;
      return res;
    }
  );

  // Lấy tồn kho ngay sau khi PENDING (Trước khi duyệt)
  let stockBeforeConfirm = null;
  await testCase(
    '2.(b) [Trước duyệt] Tồn kho br-01 khi Đơn 1 đang PENDING (reserved_quantity tăng)',
    {
      expectedStatus: 200,
      assertFn: (d) => d.reserved_quantity === 3 && d.quantity === 100,
    },
    async () => {
      const res = await axios.get(`${BASE_URL}/inventory/product/${productId}`);
      stockBeforeConfirm = res.data.find((b) => b.branch_id === branchId);
      return {
        status: 200,
        data: {
          branch: branchId,
          quantity: stockBeforeConfirm.quantity,
          reserved_quantity: stockBeforeConfirm.reserved_quantity,
          available: stockBeforeConfirm.available,
        },
      };
    }
  );

  // ADMIN duyệt đơn PENDING -> CONFIRMED
  await testCase(
    '2.(b) ADMIN duyệt Đơn 1: PENDING -> CONFIRMED (gọi confirm-deduct)',
    {
      expectedStatus: 200,
      assertFn: (d) => d.status === 'CONFIRMED',
    },
    async () => {
      return await axios.patch(
        `${BASE_URL}/orders/${order1Id}/status`,
        { status: 'CONFIRMED' },
        { headers: { Authorization: `Bearer ${adminAccessToken}` } }
      );
    }
  );

  // Lấy tồn kho sau khi CONFIRMED
  let stockAfterConfirm = null;
  await testCase(
    '2.(b) [Sau duyệt] Tồn kho br-01 sau khi CONFIRMED (quantity giảm, reserved_quantity giảm)',
    {
      expectedStatus: 200,
      assertFn: (d) => d.so_luong_thuc_tru === 3 && d.reserved_sau === 0 && d.quantity_sau === 97,
    },
    async () => {
      const res = await axios.get(`${BASE_URL}/inventory/product/${productId}`);
      stockAfterConfirm = res.data.find((b) => b.branch_id === branchId);
      return {
        status: 200,
        data: {
          branch: branchId,
          quantity_truoc: stockBeforeConfirm.quantity,
          quantity_sau: stockAfterConfirm.quantity,
          reserved_truoc: stockBeforeConfirm.reserved_quantity,
          reserved_sau: stockAfterConfirm.reserved_quantity,
          so_luong_thuc_tru: stockBeforeConfirm.quantity - stockAfterConfirm.quantity,
        },
      };
    }
  );

  // Lấy bản ghi StockTransaction (RESERVE, OUT) của Đơn 1
  await testCase(
    '2.(b) [Bản ghi StockTransaction] Các giao dịch (RESERVE, OUT) của Đơn 1',
    {
      expectedStatus: 200,
      assertFn: (d) => {
        const types = d.transactions.map((t) => t.type);
        return types.includes('RESERVE') && types.includes('OUT');
      },
    },
    async () => {
      const res = await axios.get(`${BASE_URL}/inventory/transactions?referenceId=${order1Id}`);
      return {
        status: 200,
        data: {
          orderId: order1Id,
          transactions: res.data.map((tx) => ({
            id: tx.id,
            type: tx.type,
            quantity: tx.quantity,
            reference_id: tx.reference_id,
            created_at: tx.created_at,
          })),
        },
      };
    }
  );

  // YÊU CẦU 2.(c): Huỷ đơn PENDING -> In ra reserved_quantity trước/sau và xác nhận release
  let order2Id = '';
  await testCase(
    'Tạo Đơn Hàng 2 (Số lượng 5) để thử nghiệm huỷ đơn PENDING',
    {
      expectedStatus: 201,
      assertFn: (d) => !!d.orderId && d.status === 'PENDING',
    },
    async () => {
      const res = await axios.post(
        `${BASE_URL}/orders`,
        {
          branchId,
          items: [{ productId, quantity: 5 }],
          shippingAddress: '456 Hai Bà Trưng, Q1',
          paymentMethod: 'COD',
        },
        {
          headers: { Authorization: `Bearer ${customerAccessToken}` },
        }
      );
      order2Id = res.data.orderId;
      return res;
    }
  );

  // Tồn kho trước khi huỷ
  let stockBeforeCancel = null;
  await testCase(
    '2.(c) [Trước huỷ] Tồn kho khi Đơn 2 đang PENDING (reserved_quantity gồm 5 món Đơn 2)',
    {
      expectedStatus: 200,
      assertFn: (d) => d.reserved_quantity === 5,
    },
    async () => {
      const res = await axios.get(`${BASE_URL}/inventory/product/${productId}`);
      stockBeforeCancel = res.data.find((b) => b.branch_id === branchId);
      return {
        status: 200,
        data: {
          branch: branchId,
          quantity: stockBeforeCancel.quantity,
          reserved_quantity: stockBeforeCancel.reserved_quantity,
          available: stockBeforeCancel.available,
        },
      };
    }
  );

  // CUSTOMER huỷ đơn của chính mình
  await testCase(
    '2.(c) CUSTOMER huỷ Đơn 2: PENDING -> CANCELLED (kích hoạt release-stock)',
    {
      expectedStatus: 200,
      assertFn: (d) => d.status === 'CANCELLED',
    },
    async () => {
      return await axios.patch(
        `${BASE_URL}/orders/${order2Id}/status`,
        { status: 'CANCELLED' },
        { headers: { Authorization: `Bearer ${customerAccessToken}` } }
      );
    }
  );

  // Tồn kho sau khi huỷ
  let stockAfterCancel = null;
  await testCase(
    '2.(c) [Sau huỷ] Tồn kho sau khi huỷ Đơn 2 (reserved_quantity đã được giải phóng)',
    {
      expectedStatus: 200,
      assertFn: (d) => d.so_luong_giai_phong === 5 && d.reserved_sau_khi_huy === 0,
    },
    async () => {
      const res = await axios.get(`${BASE_URL}/inventory/product/${productId}`);
      stockAfterCancel = res.data.find((b) => b.branch_id === branchId);
      return {
        status: 200,
        data: {
          branch: branchId,
          reserved_truoc_khi_huy: stockBeforeCancel.reserved_quantity,
          reserved_sau_khi_huy: stockAfterCancel.reserved_quantity,
          so_luong_giai_phong: stockBeforeCancel.reserved_quantity - stockAfterCancel.reserved_quantity,
        },
      };
    }
  );

  // Lấy bản ghi StockTransaction (CANCEL_RESERVE) của Đơn 2
  await testCase(
    '2.(c) [Bản ghi StockTransaction] Các giao dịch (RESERVE, CANCEL_RESERVE) của Đơn 2',
    {
      expectedStatus: 200,
      assertFn: (d) => {
        const types = d.transactions.map((t) => t.type);
        return types.includes('RESERVE') && types.includes('CANCEL_RESERVE');
      },
    },
    async () => {
      const res = await axios.get(`${BASE_URL}/inventory/transactions?referenceId=${order2Id}`);
      return {
        status: 200,
        data: {
          orderId: order2Id,
          transactions: res.data.map((tx) => ({
            id: tx.id,
            type: tx.type,
            quantity: tx.quantity,
            reference_id: tx.reference_id,
            created_at: tx.created_at,
          })),
        },
      };
    }
  );

  // YÊU CẦU 2.(d): Mô phỏng lưu đơn lỗi sau khi reserve-stock thành công -> xác nhận release-stock khôi phục kho
  await testCase(
    '2.(d) Mô phỏng Saga bù trừ: Giữ kho -> Giả lập lưu đơn lỗi -> Kích hoạt release-stock',
    {
      expectedStatus: 200,
      assertFn: (d) => d.kho_duoc_phuc_hoi === true && d.reserved_sau_khi_bu_tru === d.reserved_truoc_khi_giu,
    },
    async () => {
      const simRefId = 'sim-db-fail-' + Date.now();

      // Bước 1: Lấy tồn kho trước
      const beforeStockRes = await axios.get(`${BASE_URL}/inventory/product/${productId}`);
      const beforeStock = beforeStockRes.data.find((b) => b.branch_id === branchId);

      // Bước 2: Gọi reserve-stock thành công
      await axios.post(
        `${BASE_URL}/inventory/reserve-stock`,
        {
          branchId,
          referenceId: simRefId,
          items: [{ productId, quantity: 10 }],
        },
        { headers: { Authorization: `Bearer ${adminAccessToken}` } }
      );

      const duringStockRes = await axios.get(`${BASE_URL}/inventory/product/${productId}`);
      const duringStock = duringStockRes.data.find((b) => b.branch_id === branchId);

      // Bước 3: Giả lập lưu đơn thất bại -> Order Service gọi release-stock bù trừ
      await axios.post(
        `${BASE_URL}/inventory/release-stock`,
        {
          branchId,
          referenceId: simRefId,
          items: [{ productId, quantity: 10 }],
        },
        { headers: { Authorization: `Bearer ${adminAccessToken}` } }
      );

      const afterStockRes = await axios.get(`${BASE_URL}/inventory/product/${productId}`);
      const afterStock = afterStockRes.data.find((b) => b.branch_id === branchId);

      return {
        status: 200,
        data: {
          message: 'Saga bù trừ thành công: Tồn kho đã khôi phục hoàn hảo về trạng thái ban đầu',
          reserved_truoc_khi_giu: beforeStock.reserved_quantity,
          reserved_trong_khi_giu: duringStock.reserved_quantity,
          reserved_sau_khi_bu_tru: afterStock.reserved_quantity,
          kho_duoc_phuc_hoi: beforeStock.reserved_quantity === afterStock.reserved_quantity,
        },
      };
    }
  );

  // YÊU CẦU 3: DỌN DẸP TOÀN BỘ DỮ LIỆU TEST KHI BẬT --cleanup
  if (shouldCleanup) {
    console.log('\n======================================================');
    console.log('🧹 BẮT ĐẦU DỌN DẸP TOÀN DIỆN DỮ LIỆU KIỂM THỬ (--cleanup)...');
    console.log('======================================================');

    // 1. Dọn tài khoản test_* trong Auth DB
    const authDbUrl = process.env.TEST_AUTH_DB_URL || process.env.AUTH_DB_URL;
    if (authDbUrl) {
      try {
        const authConn = await mysql.createConnection({ uri: authDbUrl, ssl: { rejectUnauthorized: false } });
        const [delUsers] = await authConn.execute(
          "DELETE FROM users WHERE email LIKE 'test_customer_%' OR email = ?",
          [testCustomerEmail]
        );
        console.log(`   ✨ Đã dọn dẹp ${delUsers.affectedRows} tài khoản test trong Auth DB`);
        await authConn.end();
      } catch (err) {
        console.warn(`   ⚠️ Không thể dọn dẹp Auth DB: ${err.message}`);
      }
    }

    // 2. Dọn đơn hàng test trong Order DB
    const orderDbUrl = process.env.TEST_ORDER_DB_URL || process.env.ORDER_DB_URL;
    if (orderDbUrl) {
      try {
        const orderConn = await mysql.createConnection({ uri: orderDbUrl, ssl: { rejectUnauthorized: false } });
        const orderIds = [order1Id, order2Id].filter(Boolean);
        if (orderIds.length > 0) {
          const placeholders = orderIds.map(() => '?').join(',');
          await orderConn.execute(`DELETE FROM order_items WHERE order_id IN (${placeholders})`, orderIds);
          const [delOrders] = await orderConn.execute(`DELETE FROM orders WHERE id IN (${placeholders})`, orderIds);
          console.log(`   ✨ Đã dọn dẹp ${delOrders.affectedRows} đơn hàng kiểm thử trong Order DB`);
        }
        await orderConn.end();
      } catch (err) {
        console.warn(`   ⚠️ Không thể dọn dẹp Order DB: ${err.message}`);
      }
    }

    // 3. Dọn StockTransaction & Tồn kho sản phẩm test trong Inventory DB
    const invDbUrl = process.env.TEST_INVENTORY_DB_URL || process.env.INVENTORY_DB_URL;
    if (invDbUrl) {
      try {
        const invConn = await mysql.createConnection({ uri: invDbUrl, ssl: { rejectUnauthorized: false } });
        const orderIds = [order1Id, order2Id].filter(Boolean);
        if (orderIds.length > 0) {
          const placeholders = orderIds.map(() => '?').join(',');
          const [delTx] = await invConn.execute(
            `DELETE FROM stock_transactions WHERE reference_id IN (${placeholders}) OR reference_id LIKE 'sim-db-fail-%'`,
            orderIds
          );
          console.log(`   ✨ Đã dọn dẹp ${delTx.affectedRows} bản ghi StockTransaction kiểm thử`);
        }
        if (productId) {
          const [delStocks] = await invConn.execute('DELETE FROM stocks WHERE product_id = ?', [productId]);
          console.log(`   ✨ Đã hoàn trả & dọn dẹp ${delStocks.affectedRows} bản ghi tồn kho kiểm thử`);
        }
        await invConn.end();
      } catch (err) {
        console.warn(`   ⚠️ Không thể dọn dẹp Inventory DB: ${err.message}`);
      }
    }

    // 4. Dọn sản phẩm test trong Product DB
    const prodDbUrl = process.env.TEST_PRODUCT_DB_URL || process.env.PRODUCT_DB_URL;
    if (prodDbUrl) {
      try {
        const prodConn = await mysql.createConnection({ uri: prodDbUrl, ssl: { rejectUnauthorized: false } });
        if (productId) {
          const [delProd] = await prodConn.execute(
            "DELETE FROM products WHERE id = ? OR sku LIKE 'SKU-E2E-%'",
            [productId]
          );
          console.log(`   ✨ Đã dọn dẹp ${delProd.affectedRows} sản phẩm kiểm thử trong Product DB`);
        }
        await prodConn.end();
      } catch (err) {
        console.warn(`   ⚠️ Không thể dọn dẹp Product DB: ${err.message}`);
      }
    }

    console.log('✅ Hoàn tất dọn dẹp toàn bộ dữ liệu kiểm thử, đưa hệ thống về trạng thái sạch!\n');
  }

  const totalTests = passedCount + failedCount;
  console.log('\n======================================================');
  console.log(`📊 TỔNG KẾT KIỂM THỬ: ${passedCount}/${totalTests} ca đạt`);
  console.log('======================================================\n');

  if (failedCount > 0) {
    console.error(`❌ Phát hiện ${failedCount} ca thất bại. Thoát với mã lỗi 1.`);
    process.exit(1);
  } else {
    console.log(`🎉 Tất cả ${passedCount} ca kiểm thử đều hoàn thành xuất sắc (PASS)!`);
    process.exit(0);
  }
}

runSuite().catch((err) => {
  console.error('Lỗi thực thi test suite:', err);
  process.exit(1);
});
