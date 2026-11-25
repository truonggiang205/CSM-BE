const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:8000/api/v1';

async function run() {
  console.log('===============================================================');
  console.log('🧪 BẮT ĐẦU CHẠY BỘ TEST CHUYÊN SÂU VOUCHER / DISCOUNT SERVICE');
  console.log(`Endpoint: ${BASE_URL}`);
  console.log('===============================================================\n');

  // 1. Đăng nhập ADMIN & CUSTOMER
  let adminToken = '';
  let customerToken = '';
  let customerUserId = '';

  try {
    const adminLogin = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'admin@csm.vn',
      password: process.env.SEED_PASSWORD || 'Admin@123456',
    });
    adminToken = adminLogin.data.accessToken;
    console.log('✅ 0.1 Đăng nhập ADMIN thành công');
  } catch (err) {
    console.error('❌ 0.1 Đăng nhập ADMIN thất bại:', err.response?.data || err.message);
    process.exit(1);
  }

  try {
    const custEmail = `cust_voucher_${Date.now()}@csm.vn`;
    const custReg = await axios.post(`${BASE_URL}/auth/register`, {
      email: custEmail,
      password: 'Password@123',
      fullName: 'Khách Hàng Test Voucher',
    });
    customerToken = custReg.data.accessToken;
    customerUserId = custReg.data.user?.id || 'cust-id';
    console.log('✅ 0.2 Đăng ký & đăng nhập CUSTOMER thành công, userId:', customerUserId);
  } catch (err) {
    console.error('❌ 0.2 Đăng ký CUSTOMER thất bại:', err.response?.data || err.message);
    process.exit(1);
  }

  // Lấy 1 sản phẩm thật để test đặt đơn
  let testProductId = '';
  let testProductPrice = 0;
  try {
    const pRes = await axios.get(`${BASE_URL}/products?limit=1`);
    const p = pRes.data.items ? pRes.data.items[0] : pRes.data[0];
    testProductId = p.id;
    testProductPrice = Number(p.base_price) || 20000;
    console.log(`✅ 0.3 Lấy sản phẩm test: ${p.name} (ID: ${testProductId}, Giá: ${testProductPrice}đ)`);
  } catch (err) {
    console.error('❌ 0.3 Lấy sản phẩm thất bại:', err.message);
  }

  const results = [];

  async function testCase(id, title, fn) {
    process.stdout.write(`[${id}] ${title} ... `);
    try {
      const res = await fn();
      console.log(`✅ PASS (${res || 'OK'})`);
      results.push({ id, title, pass: true, detail: res });
    } catch (err) {
      const errMsg = err.message || JSON.stringify(err);
      console.log(`❌ FAIL -> ${errMsg}`);
      results.push({ id, title, pass: false, error: errMsg });
    }
  }

  const suffix = Date.now().toString().slice(-6);
  const testVoucherCode = `TEST_VOUCHER_${suffix}`;

  // Ca 1: Tạo voucher bằng token ADMIN
  await testCase('CA 1', 'Tạo voucher hợp lệ bằng token ADMIN', async () => {
    const res = await axios.post(
      `${BASE_URL}/vouchers`,
      {
        code: testVoucherCode,
        description: 'Voucher test kiểm thử E2E',
        discount_type: 'FIXED_AMOUNT',
        discount_value: 20000,
        min_order_value: 30000,
        usage_limit: 10,
        max_usage_per_user: 1,
        start_date: new Date(Date.now() - 3600000).toISOString(),
        end_date: new Date(Date.now() + 86400000).toISOString(),
      },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    if (res.status !== 201 && res.status !== 200) throw new Error(`HTTP status: ${res.status}`);
    return `Mã: ${res.data.code}, Giá trị giảm: ${res.data.discount_value}`;
  });

  // Ca 2: CUSTOMER bị chặn tạo voucher (Kỳ vọng 403 Forbidden)
  await testCase('CA 2', 'CUSTOMER cố tình gọi POST /vouchers (Kỳ vọng 403)', async () => {
    try {
      const res = await axios.post(
        `${BASE_URL}/vouchers`,
        {
          code: `HACK_${suffix}`,
          discount_type: 'FIXED_AMOUNT',
          discount_value: 50000,
          start_date: new Date().toISOString(),
          end_date: new Date(Date.now() + 86400000).toISOString(),
        },
        { headers: { Authorization: `Bearer ${customerToken}` } },
      );
      throw new Error(`LỖ HỔNG BẢO MẬT: Customer tạo được voucher với status ${res.status}`);
    } catch (err) {
      if (err.response?.status === 403) {
        return `Đã chặn thành công với 403 Forbidden`;
      }
      if (err.response) {
        throw new Error(`Nhận status ${err.response.status} thay vì 403: ${JSON.stringify(err.response.data)}`);
      }
      throw err;
    }
  });

  // Ca 3: Validate voucher
  await testCase('CA 3.1', 'Validate voucher hợp lệ', async () => {
    const res = await axios.post(
      `${BASE_URL}/vouchers/validate`,
      { code: testVoucherCode, orderValue: 50000, userId: customerUserId },
      { headers: { Authorization: `Bearer ${customerToken}` } },
    );
    if (!res.data.valid && !res.data.isValid) throw new Error('Voucher báo không hợp lệ');
    if (res.data.discountAmount !== 20000) throw new Error(`discountAmount sai: ${res.data.discountAmount}`);
    return `Giảm: ${res.data.discountAmount}đ, Tiền sau giảm: ${res.data.finalAmount}đ`;
  });

  await testCase('CA 3.2', 'Validate voucher đơn hàng dưới min_order_value (Kỳ vọng 400)', async () => {
    try {
      await axios.post(
        `${BASE_URL}/vouchers/validate`,
        { code: testVoucherCode, orderValue: 10000, userId: customerUserId },
        { headers: { Authorization: `Bearer ${customerToken}` } },
      );
      throw new Error('Đơn hàng dưới mức tối thiểu nhưng vẫn được duyệt');
    } catch (err) {
      if (err.response?.status === 400) return `Chặn thành công 400 Bad Request`;
      throw err;
    }
  });

  await testCase('CA 3.3', 'Validate voucher mã sai / không tồn tại (Kỳ vọng 404)', async () => {
    try {
      await axios.post(
        `${BASE_URL}/vouchers/validate`,
        { code: 'NON_EXISTENT_CODE_XYZ', orderValue: 50000, userId: customerUserId },
        { headers: { Authorization: `Bearer ${customerToken}` } },
      );
      throw new Error('Mã không tồn tại nhưng vẫn được duyệt');
    } catch (err) {
      if (err.response?.status === 404) return `Báo 404 Not Found đúng chuẩn`;
      throw err;
    }
  });

  // Ca 4: Đặt đơn có voucher và kiểm tra số tiền server tính
  let firstOrderId = '';
  await testCase('CA 4', 'Đặt đơn hàng có voucher và kiểm tra tiền server tính', async () => {
    const quantity = Math.ceil(40000 / testProductPrice); // Đảm bảo đơn >= 30.000đ
    const subtotal = testProductPrice * quantity;
    const shipping = subtotal >= 150000 ? 0 : 15000;
    const expectedDiscount = 20000;
    const expectedTotal = subtotal + shipping - expectedDiscount;

    const res = await axios.post(
      `${BASE_URL}/orders`,
      {
        branchId: 'br-01',
        shippingAddress: '123 Test Street, Q1',
        paymentMethod: 'COD',
        voucherCode: testVoucherCode,
        items: [{ productId: testProductId, quantity }],
      },
      { headers: { Authorization: `Bearer ${customerToken}` } },
    );

    if (res.status !== 201 && res.status !== 200) throw new Error(`HTTP status: ${res.status}`);
    firstOrderId = res.data.orderId;

    // Lấy thông tin đơn hàng để kiểm tra các trường tiền
    const orderRes = await axios.get(`${BASE_URL}/orders/${firstOrderId}`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    const o = orderRes.data;
    if (Number(o.discount_amount) !== expectedDiscount) {
      throw new Error(`discount_amount sai: ${o.discount_amount} (Kỳ vọng: ${expectedDiscount})`);
    }
    if (Number(o.total_amount) !== expectedTotal) {
      throw new Error(`total_amount sai: ${o.total_amount} (Kỳ vọng: ${expectedTotal})`);
    }
    return `Đơn ${firstOrderId}: Subtotal ${subtotal}đ, Giảm ${o.discount_amount}đ, Tổng ${o.total_amount}đ`;
  });

  // Chờ một chút để claim voucher kịp xử lý nếu là fire-and-forget
  await new Promise(r => setTimeout(r, 1000));

  // Ca 5: Đặt lần 2 vượt giới hạn user (max_usage_per_user = 1) -> Kỳ vọng bị từ chối
  await testCase('CA 5', 'Đặt đơn lần 2 với cùng voucher vượt giới hạn user (Kỳ vọng bị từ chối)', async () => {
    const quantity = Math.ceil(40000 / testProductPrice);
    try {
      const res = await axios.post(
        `${BASE_URL}/orders`,
        {
          branchId: 'br-01',
          shippingAddress: '123 Test Street, Q1',
          paymentMethod: 'COD',
          voucherCode: testVoucherCode,
          items: [{ productId: testProductId, quantity }],
        },
        { headers: { Authorization: `Bearer ${customerToken}` } },
      );
      throw new Error(`LỖI: User đã dùng voucher nhưng vẫn đặt được đơn thứ hai (#${res.data.orderId})`);
    } catch (err) {
      if (err.response?.status === 400 || err.response?.status === 404) {
        return `Đã từ chối đơn lần 2 với mã lỗi ${err.response.status}: ${JSON.stringify(err.response.data.message)}`;
      }
      throw err;
    }
  });

  // Ca 6: 10 request đồng thời với voucher còn 1 lượt thì CHỈ 1 thành công
  await testCase('CA 6', '10 request đồng thời cho voucher còn đúng 1 lượt dùng', async () => {
    // 6.1 Tạo voucher có usage_limit = 1
    const singleCode = `CONCURRENT_${Date.now()}`;
    await axios.post(
      `${BASE_URL}/vouchers`,
      {
        code: singleCode,
        description: 'Voucher còn 1 lượt duy nhất',
        discount_type: 'FIXED_AMOUNT',
        discount_value: 10000,
        min_order_value: 20000,
        usage_limit: 1,
        max_usage_per_user: 1,
        start_date: new Date(Date.now() - 3600000).toISOString(),
        end_date: new Date(Date.now() + 86400000).toISOString(),
      },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );

    // 6.2 Gửi đồng thời 10 request đặt đơn
    const quantity = Math.ceil(30000 / testProductPrice);
    const promises = Array.from({ length: 10 }, (_, i) => {
      // Dùng các user hoặc cùng user để kiểm thử
      return axios.post(
        `${BASE_URL}/orders`,
        {
          branchId: 'br-01',
          shippingAddress: `Concurrent Address ${i}`,
          paymentMethod: 'COD',
          voucherCode: singleCode,
          items: [{ productId: testProductId, quantity }],
        },
        { headers: { Authorization: `Bearer ${customerToken}` }, validateStatus: () => true },
      );
    });

    const responses = await Promise.all(promises);
    const successes = responses.filter(r => r.status === 201 || r.status === 200);
    const failures = responses.filter(r => r.status >= 400);

    if (successes.length !== 1) {
      throw new Error(`RACE CONDITION PHÁT HIỆN: Có ${successes.length}/10 request thành công (Kỳ vọng DUY NHẤT 1)`);
    }
    return `Chính xác: 1 thành công (Order #${successes[0].data.orderId}), 9 bị từ chối`;
  });

  // Ca 7: Huỷ đơn hoàn lại lượt dùng
  await testCase('CA 7', 'Huỷ đơn hàng đã dùng voucher -> Hoàn lại lượt dùng', async () => {
    if (!firstOrderId) throw new Error('Không có firstOrderId từ Ca 4');

    // 7.1 Huỷ đơn hàng
    const cancelRes = await axios.patch(
      `${BASE_URL}/orders/${firstOrderId}/status`,
      { status: 'CANCELLED' },
      { headers: { Authorization: `Bearer ${customerToken}` } },
    );
    if (cancelRes.status !== 200) throw new Error(`Huỷ đơn thất bại: status ${cancelRes.status}`);

    // Đợi 500ms để release hoàn tất
    await new Promise(r => setTimeout(r, 500));

    // 7.2 Thử validate lại voucher xem user có áp dụng lại được không
    const valRes = await axios.post(
      `${BASE_URL}/vouchers/validate`,
      { code: testVoucherCode, orderValue: 50000, userId: customerUserId },
      { headers: { Authorization: `Bearer ${customerToken}` } },
    );

    if (!valRes.data.valid && !valRes.data.isValid) {
      throw new Error(`Sau khi huỷ đơn, voucher vẫn không áp dụng lại được cho user: ${JSON.stringify(valRes.data)}`);
    }
    return `Đơn #${firstOrderId} đã huỷ và voucher ${testVoucherCode} đã được mở lại cho User`;
  });

  console.log('\n===============================================================');
  console.log('📊 TỔNG KẾT BỘ KIỂM THỬ VOUCHER:');
  const passCount = results.filter(r => r.pass).length;
  console.log(`Kết quả: ${passCount}/${results.length} ca đạt`);
  console.log('===============================================================');
}

run().catch(console.error);
