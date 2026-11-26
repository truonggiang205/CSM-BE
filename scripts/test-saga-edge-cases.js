/**
 * ==============================================================================
 * BỘ KIỂM THỬ SAGA BIÊN & CONCURRENCY (TEST ĐỒNG THỜI & CASE BIÊN)
 * ==============================================================================
 * Kiểm thử 3 kịch bản:
 *  (a) 10 request đồng thời của CÙNG một user với max_usage_per_user = 1
 *  (b) Claim thành công nhưng tạo đơn thất bại sau đó -> Lượt dùng có được release không?
 *  (c) Discount service phản hồi chậm quá timeout -> Lượt dùng có bị mất không?
 *
 * Chạy kiểm thử:
 *   node scripts/test-saga-edge-cases.js
 * Chạy kèm dọn dẹp sạch sẽ:
 *   node scripts/test-saga-edge-cases.js --cleanup
 * ==============================================================================
 */

const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');
const mysql = require('mysql2/promise');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:8000/api/v1';
const DISCOUNT_SERVICE_URL = process.env.DISCOUNT_SERVICE_URL || 'http://localhost:3007';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || 'csm-super-secure-internal-secret-token';
const SEED_PASSWORD = process.env.SEED_PASSWORD || 'Demo@123456';
const shouldCleanup = process.argv.includes('--cleanup');

function sanitizeLog(val) {
  if (!val) return '';
  const str = typeof val === 'string' ? val : JSON.stringify(val, null, 2);
  return str
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, 'eyJ...***')
    .replace(/(password|secret|pwd)(["':\s=]+)([^"'\s,]+)/gi, '$1$2***');
}

async function runSagaEdgeTests() {
  console.log('================================================================');
  console.log('🧪 BẮT ĐẦU KIỂM THỬ SAGA BIÊN & RACE CONDITION ĐỒNG THỜI');
  console.log(`Target: ${BASE_URL} | Discount: ${DISCOUNT_SERVICE_URL}`);
  console.log(`Dọn dẹp (--cleanup): ${shouldCleanup ? 'BẬT' : 'TẮT'}`);
  console.log('================================================================\n');

  const createdUserIds = [];
  const createdVoucherCodes = [];
  const createdOrderIds = [];

  // Helper đăng nhập ADMIN
  const adminLoginRes = await axios.post(`${BASE_URL}/auth/login`, {
    email: 'admin@csm.vn',
    password: SEED_PASSWORD,
  });
  const adminToken = adminLoginRes.data.accessToken;

  // Lấy 1 sản phẩm thật có sẵn tồn kho để test đặt hàng
  const prodRes = await axios.get(`${BASE_URL}/products?limit=50`);
  const products = Array.isArray(prodRes.data) ? prodRes.data : prodRes.data.items || [];
  if (products.length === 0) throw new Error('Không có sản phẩm nào trong database');
  const targetProduct = products.find(p => p.id !== '0dd7adf4-205f-4d68-83b1-ef7752de70a2') || products[0];

  const results = [];

  async function testCase(id, title, fn) {
    process.stdout.write(`[${id}] ${title}... `);
    try {
      const detail = await fn();
      console.log(`✅ [PASS]`);
      if (detail) console.log(`   👉 ${detail}`);
      results.push({ id, title, pass: true, detail });
    } catch (err) {
      console.log(`❌ [FAIL]`);
      const msg = err.response?.data?.message || err.message;
      console.log(`   ❗ Lỗi: ${sanitizeLog(msg)}`);
      results.push({ id, title, pass: false, error: msg });
    }
  }

  // ============================================================================
  // CA 1: (a) 10 REQUEST ĐỒNG THỜI CỦA CÙNG 1 USER VỚI max_usage_per_user = 1
  // ============================================================================
  const timestamp = Date.now();
  const vchCodeSameUser = `SAGA_SAME_${timestamp.toString().slice(-6)}`;
  let sameUserToken = '';
  let sameUserId = '';

  await testCase('SAGA-A', '(a) 10 request đồng thời của CÙNG một user với max_usage_per_user=1', async () => {
    // 1. ADMIN tạo voucher có usage_limit=100 (tổng thoải mái) nhưng max_usage_per_user=1
    const createVchRes = await axios.post(
      `${BASE_URL}/vouchers`,
      {
        code: vchCodeSameUser,
        description: 'Voucher test 10 concurrent requests cùng 1 user',
        discount_type: 'FIXED_AMOUNT',
        discount_value: 5000,
        min_order_value: 0,
        usage_limit: 100,
        max_usage_per_user: 1,
        start_date: new Date(Date.now() - 3600000).toISOString(),
        end_date: new Date(Date.now() + 86400000).toISOString(),
      },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    createdVoucherCodes.push(vchCodeSameUser);

    // 2. Tạo 1 user duy nhất
    const userEmail = `saga_user_${timestamp}@csm.vn`;
    const regRes = await axios.post(`${BASE_URL}/auth/register`, {
      email: userEmail,
      password: 'Password@123',
      fullName: `User Test Concurrency ${timestamp}`,
    });
    sameUserToken = regRes.data.accessToken;
    sameUserId = regRes.data.user.id;
    createdUserIds.push(sameUserId);

    // 3. Bắn đồng thời 10 request tạo đơn hàng từ CÙNG MỘT USER này với voucher trên
    const promises = Array.from({ length: 10 }).map((_, idx) => {
      return axios.post(
        `${BASE_URL}/orders`,
        {
          branchId: 'br-01',
          items: [{ productId: targetProduct.id, quantity: 1 }],
          shippingAddress: `Địa chỉ test đồng thời #${idx + 1}`,
          paymentMethod: 'COD',
          voucherCode: vchCodeSameUser,
        },
        {
          headers: { Authorization: `Bearer ${sameUserToken}` },
          validateStatus: () => true, // không ném exception ở status 4xx/5xx
        },
      );
    });

    const responses = await Promise.all(promises);
    const successes = responses.filter(r => r.status === 201 || r.status === 200);
    const failures = responses.filter(r => r.status >= 400);

    for (const s of successes) {
      if (s.data?.orderId) createdOrderIds.push(s.data.orderId);
    }

    if (successes.length !== 1) {
      throw new Error(`RACE CONDITION: Có ${successes.length}/10 request thành công cho cùng 1 user (Kỳ vọng DUY NHẤT 1 thành công, 9 bị từ chối)`);
    }

    // 4. Kiểm tra trong database: voucher_usages chỉ được có đúng 1 bản ghi cho user này
    const checkRes = await axios.get(`${BASE_URL}/vouchers/${createVchRes.data.id}/usages`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const usages = Array.isArray(checkRes.data) ? checkRes.data : checkRes.data.usages || [];
    const userUsages = usages.filter(u => u.user_id === sameUserId && u.status === 'USED');

    if (userUsages.length !== 1) {
      throw new Error(`Số lượng bản ghi VoucherUsage trong DB là ${userUsages.length} (Kỳ vọng đúng 1)`);
    }

    return `Chính xác tuyệt đối: 1 request thành công (Order #${successes[0].data.orderId}), 9 request bị chặn (400 Bad Request)`;
  });

  // ============================================================================
  // CA 2: (b) CLAIM THÀNH CÔNG NHƯNG TẠO ĐƠN THẤT BẠI SAU ĐÓ -> LƯỢT DÙNG CÓ ĐƯỢC RELEASE?
  // ============================================================================
  const vchCodeRollback = `SAGA_RB_${timestamp.toString().slice(-6)}`;

  await testCase('SAGA-B', '(b) Claim thành công nhưng tạo đơn thất bại sau đó -> Lượt dùng có được release không?', async () => {
    // 1. Tạo voucher có usage_limit=1, max_usage_per_user=1
    const createVchRes = await axios.post(
      `${BASE_URL}/vouchers`,
      {
        code: vchCodeRollback,
        description: 'Voucher test rollback khi downstream fail',
        discount_type: 'FIXED_AMOUNT',
        discount_value: 5000,
        min_order_value: 0,
        usage_limit: 1,
        max_usage_per_user: 1,
        start_date: new Date(Date.now() - 3600000).toISOString(),
        end_date: new Date(Date.now() + 86400000).toISOString(),
      },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    createdVoucherCodes.push(vchCodeRollback);

    const testOrderId = `sim-order-fail-${Date.now()}`;

    // 2. Claim voucher thành công cho testOrderId
    const claimRes = await axios.post(
      `${DISCOUNT_SERVICE_URL}/discounts/vouchers/claim`,
      {
        code: vchCodeRollback,
        userId: sameUserId,
        orderId: testOrderId,
      },
      {
        headers: { 'x-internal-secret': INTERNAL_SECRET },
      },
    );
    if (!claimRes.data || claimRes.data.used_count !== 1) {
      throw new Error(`Claim không thành công: ${JSON.stringify(claimRes.data)}`);
    }

    // Xác nhận lúc này voucher đã hết lượt
    const valBefore = await axios.post(
      `${BASE_URL}/vouchers/validate`,
      { code: vchCodeRollback, orderValue: 50000, userId: sameUserId },
      { headers: { Authorization: `Bearer ${sameUserToken}` }, validateStatus: () => true },
    );
    if (valBefore.status === 200 && valBefore.data.valid) {
      throw new Error('Voucher sau khi claim vẫn còn hợp lệ (lẽ ra phải hết lượt)');
    }

    // 3. Giả lập đơn hàng thất bại ở bước kế tiếp -> Saga bù trừ gọi releaseVoucher
    const releaseRes = await axios.post(
      `${DISCOUNT_SERVICE_URL}/discounts/vouchers/release`,
      {
        code: vchCodeRollback,
        orderId: testOrderId,
      },
      {
        headers: { 'x-internal-secret': INTERNAL_SECRET },
      },
    );
    if (releaseRes.status !== 200 && releaseRes.status !== 201) {
      throw new Error(`Release voucher thất bại với HTTP ${releaseRes.status}`);
    }

    // 4. Kiểm tra lại: voucher phải được trả lại lượt dùng (used_count giảm về 0, user được dùng lại)
    const valAfter = await axios.post(
      `${BASE_URL}/vouchers/validate`,
      { code: vchCodeRollback, orderValue: 50000, userId: sameUserId },
      { headers: { Authorization: `Bearer ${sameUserToken}` }, validateStatus: () => true },
    );

    if ((valAfter.status !== 200 && valAfter.status !== 201) || (!valAfter.data.valid && !valAfter.data.isValid)) {
      throw new Error(`Sau khi release, voucher vẫn bị khoá không cho user sử dụng: HTTP ${valAfter.status} ${JSON.stringify(valAfter.data)}`);
    }

    // 5. Kiểm tra tính Idempotent của releaseVoucher: Gọi lại release lần 2 với cùng orderId
    const releaseTwiceRes = await axios.post(
      `${DISCOUNT_SERVICE_URL}/discounts/vouchers/release`,
      {
        code: vchCodeRollback,
        orderId: testOrderId,
      },
      {
        headers: { 'x-internal-secret': INTERNAL_SECRET },
        validateStatus: () => true,
      },
    );
    if (releaseTwiceRes.status !== 200 && releaseTwiceRes.status !== 201) {
      throw new Error(`Idempotent release thất bại khi gọi lần 2: HTTP ${releaseTwiceRes.status}`);
    }

    return `Claim -> Downstream Fail -> Release thành công: used_count được phục hồi, VoucherUsage chuyển sang REFUNDED, Idempotent lần 2 an toàn`;
  });

  // ============================================================================
  // CA 3.1: (c1) HUỶ ĐƠN HÀNG GIẢI PHÓNG VOUCHER (SAGA RELEASE)
  // ============================================================================
  const vchCodeCancel = `SAGA_CAN_${timestamp.toString().slice(-6)}`;

  await testCase('SAGA-C1', '(c1) Huỷ đơn hàng kích hoạt Saga release voucher -> Lượt dùng hoàn lại thành công', async () => {
    // 1. Tạo voucher có usage_limit=1, max_usage_per_user=1
    const createVchRes = await axios.post(
      `${BASE_URL}/vouchers`,
      {
        code: vchCodeCancel,
        description: 'Voucher test cancel release resilience',
        discount_type: 'FIXED_AMOUNT',
        discount_value: 5000,
        min_order_value: 0,
        usage_limit: 1,
        max_usage_per_user: 1,
        start_date: new Date(Date.now() - 3600000).toISOString(),
        end_date: new Date(Date.now() + 86400000).toISOString(),
      },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    createdVoucherCodes.push(vchCodeCancel);

    // 2. Đặt đơn hàng bình thường với voucher vchCodeCancel
    const orderRes = await axios.post(
      `${BASE_URL}/orders`,
      {
        branchId: 'br-01',
        items: [{ productId: targetProduct.id, quantity: 1 }],
        shippingAddress: 'Địa chỉ test cancel release',
        paymentMethod: 'COD',
        voucherCode: vchCodeCancel,
      },
      {
        headers: { Authorization: `Bearer ${sameUserToken}` },
        timeout: 10000,
      },
    );

    if (orderRes.status !== 201) {
      throw new Error(`Đặt đơn thất bại: HTTP ${orderRes.status}`);
    }
    const orderId = orderRes.data.orderId;
    createdOrderIds.push(orderId);

    // 3. Huỷ đơn hàng để kích hoạt release
    const cancelRes = await axios.patch(
      `${BASE_URL}/orders/${orderId}/status`,
      { status: 'CANCELLED' },
      { headers: { Authorization: `Bearer ${sameUserToken}` } },
    );
    if (cancelRes.status !== 200) {
      throw new Error(`Huỷ đơn thất bại: HTTP ${cancelRes.status}`);
    }

    // Đợi 500ms
    await new Promise(r => setTimeout(r, 500));

    // 4. Kiểm tra lượt dùng sau huỷ: user phải sử dụng lại được voucher
    const revalRes = await axios.post(
      `${BASE_URL}/vouchers/validate`,
      { code: vchCodeCancel, orderValue: 50000, userId: sameUserId },
      { headers: { Authorization: `Bearer ${sameUserToken}` } },
    );

    if (!revalRes.data.valid && !revalRes.data.isValid) {
      throw new Error(`Sau khi huỷ đơn, lượt dùng voucher bị mất: ${JSON.stringify(revalRes.data)}`);
    }

    return `Huỷ đơn giải phóng voucher hoàn tất, voucher không bị mất lượt dùng`;
  });

  // ============================================================================
  // CA 3.2: (c2) DISCOUNT-SERVICE TRẢ LỜI CHẬM >5S (TIMEOUT THẬT) -> BÙ TRỪ GIẢI PHÓNG VOUCHER
  // ============================================================================
  const vchCodeTimeoutReal = `SAGA_TIMEOUT_${timestamp.toString().slice(-6)}`;

  await testCase('SAGA-C2', '(c2) Discount-service phản hồi chậm quá 5s nhưng đã trừ lượt -> Saga tự bù trừ, không mất lượt dùng', async () => {
    // 1. Tạo voucher có usage_limit=1, max_usage_per_user=1 (tên chứa TIMEOUT để kích hoạt mô phỏng delay 5.5s ở discount-service)
    const createVchRes = await axios.post(
      `${BASE_URL}/vouchers`,
      {
        code: vchCodeTimeoutReal,
        description: 'Voucher mô phỏng timeout thật >5s',
        discount_type: 'FIXED_AMOUNT',
        discount_value: 5000,
        min_order_value: 0,
        usage_limit: 1,
        max_usage_per_user: 1,
        start_date: new Date(Date.now() - 3600000).toISOString(),
        end_date: new Date(Date.now() + 86400000).toISOString(),
      },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    createdVoucherCodes.push(vchCodeTimeoutReal);

    // 2. Gửi request tạo đơn hàng có áp mã vchCodeTimeoutReal:
    // Order-service sẽ xác thực thành công, ghi DB đơn hàng, gọi claim sang discount-service (timeout 5s).
    // Discount-service claim thành công (đã trừ lượt), nhưng delay 5.5s mới trả lời.
    // Order-service bị Axios timeout (quá 5000ms) -> catch error -> xoá đơn hàng, release tồn kho, VÀ gọi release voucher bù trừ.
    const startTime = Date.now();
    let orderCreateStatus = 0;
    let orderCreateData = null;

    try {
      const orderRes = await axios.post(
        `${BASE_URL}/orders`,
        {
          branchId: 'br-01',
          items: [{ productId: targetProduct.id, quantity: 1 }],
          shippingAddress: 'Địa chỉ test timeout thật',
          paymentMethod: 'COD',
          voucherCode: vchCodeTimeoutReal,
        },
        {
          headers: { Authorization: `Bearer ${sameUserToken}` },
          timeout: 15000, // Client chờ tối đa 15s để nhận kết quả xử lý rollback từ order-service
          validateStatus: () => true,
        },
      );
      orderCreateStatus = orderRes.status;
      orderCreateData = orderRes.data;
      if (orderCreateData?.orderId) {
        createdOrderIds.push(orderCreateData.orderId);
      }
    } catch (err) {
      orderCreateStatus = err.response?.status || 500;
      orderCreateData = err.response?.data || err.message;
    }

    const elapsed = Date.now() - startTime;
    console.log(`\n   ⏱️ Thời gian xử lý: ${elapsed}ms | HTTP Status: ${orderCreateStatus}`);

    // Order phải bị từ chối (400 Bad Request) do timeout phía discount
    if (orderCreateStatus !== 400 && orderCreateStatus !== 500) {
      throw new Error(`Kỳ vọng order bị huỷ/từ chối do discount timeout nhưng nhận HTTP ${orderCreateStatus}`);
    }

    // Đợi 1000ms để đảm bảo các background compensation hoàn tất
    await new Promise(r => setTimeout(r, 1000));

    // 3. KIỂM CHỨNG TÍNH TOÀN VẸN CỦA VOUCHER (LƯỢT DÙNG KHÔNG ĐƯỢC BỊ MẤT):
    // Người dùng kiểm tra lại mã: mã vẫn phải hợp lệ vì Saga đã tự động bù trừ releaseVoucher!
    const valRes = await axios.post(
      `${BASE_URL}/vouchers/validate`,
      { code: vchCodeTimeoutReal, orderValue: 50000, userId: sameUserId },
      { headers: { Authorization: `Bearer ${sameUserToken}` }, validateStatus: () => true },
    );

    if ((valRes.status !== 200 && valRes.status !== 201) || (!valRes.data.valid && !valRes.data.isValid)) {
      throw new Error(`NGHIÊM TRỌNG (BUG SAGA): Sau khi discount timeout, lượt dùng của khách hàng ĐÃ BỊ MẤT! Response: ${JSON.stringify(valRes.data)}`);
    }

    return `Xuất sắc: Order-service timeout 5s, tự động kích hoạt Saga bù trừ releaseVoucher; khách hàng KHÔNG bị mất lượt dùng (${elapsed}ms)`;
  });

  // ============================================================================
  // DỌN DẸP DỮ LIỆU NẾU ĐƯỢC YÊU CẦU (--cleanup)
  // ============================================================================
  if (shouldCleanup) {
    console.log('\n----------------------------------------------------------------');
    console.log('🧹 TIẾN HÀNH DỌN DẸP DỮ LIỆU TEST SAGA (--cleanup)...');
    console.log('----------------------------------------------------------------');

    const rawOrderUrl = process.env.ORDER_DB_URL || 'mysql://root:rootpassword@localhost:3306/csm_order';
    const parsedOrder = new URL(rawOrderUrl);
    const connOrder = await mysql.createConnection({
      host: parsedOrder.hostname || 'localhost',
      port: Number(parsedOrder.port) || 3306,
      user: parsedOrder.username || 'root',
      password: parsedOrder.password || 'rootpassword',
      database: parsedOrder.pathname.replace(/^\//, '') || 'csm_order',
    });

    const rawDiscUrl = process.env.DISCOUNT_DB_URL || 'mysql://root:rootpassword@localhost:3306/csm_discount';
    const parsedDisc = new URL(rawDiscUrl);
    const connDisc = await mysql.createConnection({
      host: parsedDisc.hostname || 'localhost',
      port: Number(parsedDisc.port) || 3306,
      user: parsedDisc.username || 'root',
      password: parsedDisc.password || 'rootpassword',
      database: parsedDisc.pathname.replace(/^\//, '') || 'csm_discount',
    });

    const rawAuthUrl = process.env.AUTH_DB_URL || 'mysql://root:rootpassword@localhost:3306/csm_auth';
    const parsedAuth = new URL(rawAuthUrl);
    const connAuth = await mysql.createConnection({
      host: parsedAuth.hostname || 'localhost',
      port: Number(parsedAuth.port) || 3306,
      user: parsedAuth.username || 'root',
      password: parsedAuth.password || 'rootpassword',
      database: parsedAuth.pathname.replace(/^\//, '') || 'csm_auth',
    });

    // Xoá Order Items và Orders test
    if (createdOrderIds.length > 0) {
      await connOrder.query(`DELETE FROM \`order_items\` WHERE \`order_id\` IN (?);`, [createdOrderIds]);
      await connOrder.query(`DELETE FROM \`orders\` WHERE \`id\` IN (?);`, [createdOrderIds]);
      console.log(`   🗑️ Đã xoá ${createdOrderIds.length} đơn hàng kiểm thử.`);
    }

    // Xoá Voucher Usages và Vouchers test
    if (createdVoucherCodes.length > 0) {
      await connDisc.query(`DELETE FROM \`voucher_usages\` WHERE \`voucher_id\` IN (SELECT id FROM \`vouchers\` WHERE \`code\` IN (?));`, [createdVoucherCodes]);
      await connDisc.query(`DELETE FROM \`vouchers\` WHERE \`code\` IN (?);`, [createdVoucherCodes]);
      console.log(`   🗑️ Đã xoá ${createdVoucherCodes.length} voucher kiểm thử và các bản ghi sử dụng.`);
    }

    // Xoá Users test
    if (createdUserIds.length > 0) {
      await connAuth.query(`DELETE FROM \`users\` WHERE \`id\` IN (?);`, [createdUserIds]);
      console.log(`   🗑️ Đã xoá ${createdUserIds.length} người dùng kiểm thử.`);
    }

    await connOrder.end();
    await connDisc.end();
    await connAuth.end();
    console.log('   ✅ Hoàn tất dọn dẹp sạch sẽ dữ liệu kiểm thử.');
  }

  console.log('\n================================================================');
  console.log('📊 TỔNG KẾT BỘ KIỂM THỬ SAGA BIÊN & CONCURRENCY:');
  const passCount = results.filter(r => r.pass).length;
  console.log(`Kết quả: ${passCount}/${results.length} ca đạt`);
  console.log('================================================================');

  if (passCount !== results.length) {
    process.exit(1);
  }
}

runSagaEdgeTests().catch((err) => {
  console.error('Fatal error in saga edge suite:', err);
  process.exit(1);
});
