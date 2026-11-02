/**
 * ==============================================================================
 * BỘ KIỂM THỬ E2E TOÀN DIỆN HỆ THỐNG CSM-BE (MICROSERVICES)
 * ==============================================================================
 * Khôi phục & gộp toàn diện tất cả các kịch bản kiểm thử:
 *  - Nhóm 1: Xác thực & Phân quyền (Auth, Đăng ký không chọn role, Refresh token, Type claim)
 *  - Nhóm 2: Quản lý chi nhánh & Haversine (CRUD chi nhánh, Tìm chi nhánh gần nhất, 409 xoá chi nhánh còn kho)
 *  - Nhóm 3: Danh mục & Kho hàng (Tạo sản phẩm, Nhập kho đa chi nhánh br-01 & br-02, Phân quyền kho hàng)
 *  - Nhóm 4: Đồng thời & Idempotency kho (5 giao dịch đồng thời, Idempotency reserve-stock, Chặn đặt quá kho)
 *  - Nhóm 5: Validation đặt hàng & State Machine & Saga
 *            (Validation thiếu items, thiếu branchId, quantity <= 0, product 404, branch 400;
 *             Saga giữ kho, confirm-deduct, cancel release-stock, bù trừ;
 *             State machine PAID->SHIPPED, SHIPPED terminal, CANCELLED terminal, MANAGER & ADMIN cập nhật)
 *  - Nhóm 6: CSM-29 Order Query APIs, Lọc đa tiêu chí & Khoá chi nhánh
 *            (GET /orders/my; GET /orders: phân trang limit=1, lọc status, lọc branchId, tìm search mã đơn,
 *             lọc khoảng ngày hợp lệ & không hợp lệ 400, format chuẩn { items, total, page, limit, totalPages };
 *             Test khoá chi nhánh: Đơn br-02 ẩn khỏi MANAGER br-01, GET /orders/:id đơn br-02 trả 403; ADMIN 200;
 *             CUSTOMER 403 xem đơn người khác)
 *  - Nhóm 7: Mô phỏng thanh toán trực tuyến bảo mật
 *            (POST /payments/create: không JWT 401, JWT người khác 403, chủ đơn 201, ADMIN 201;
 *             JWT token 10 phút, kiểm tra đơn COD 400, GET HTML không đổi status,
 *             kích hoạt trừ kho PAID, Idempotency lần 2, server tắt trả 404 kể cả cờ giả)
 *
 * Chạy kiểm thử:
 *   node scripts/test-e2e.js
 * Chạy kèm dọn dẹp sạch sẽ dữ liệu kiểm thử:
 *   node scripts/test-e2e.js --cleanup
 * ==============================================================================
 */

const fs = require('fs');
const { spawn, execSync } = require('child_process');
const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:8000/api/v1';
const PAYMENT_SIMULATION_SECRET = process.env.PAYMENT_SIMULATION_SECRET || 'csm-payment-simulation-secret-key-2026';
const shouldCleanup = process.argv.includes('--cleanup') || process.env.TEST_CLEANUP === 'true';

// Helper che giấu JWT và mật khẩu nhạy cảm
function sanitizeLog(val) {
  if (!val) return '';
  const str = typeof val === 'string' ? val : JSON.stringify(val, null, 2);
  return str
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, 'eyJ...***')
    .replace(/(password|secret|pwd)(["':\s=]+)([^"'\s,]+)/gi, '$1$2***');
}

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
    } else {
      failedCount++;
      console.log(`  [FAIL] [${actualStatus}] ${name}`);
      console.log(`   ❌ Lý do: ${failureReason}`);
      console.log(`   Response: ${sanitizeLog(actualData).slice(0, 300)}`);
    }

    results.push({ name, passed, status: actualStatus, data: actualData, failureReason });
    return { status: actualStatus, data: actualData, passed };
  }

  // ============================================================================
  // NHÓM 1: AUTHENTICATION, AUTHORIZATION & TOKEN LIFECYCLE
  // ============================================================================
  console.log('\n--- NHÓM 1: XÁC THỰC, PHÂN QUYỀN & TOKEN LIFECYCLE ---');

  const unspecifiedRoleEmail = `test_norole_${Date.now()}@csm.vn`;
  await testCase(
    '1.1 Đăng ký tài khoản không chọn role -> Mặc định server gán role=CUSTOMER',
    {
      expectedStatus: 201,
      assertFn: (d) => d.user?.role === 'CUSTOMER' && !!d.accessToken && !!d.refreshToken,
    },
    async () => {
      return await axios.post(`${BASE_URL}/auth/register`, {
        email: unspecifiedRoleEmail,
        password: 'Password@123',
        fullName: 'Khách Hàng Mặc Định Role',
      });
    }
  );

  let newCustomerToken = '';
  let newCustomerRefreshToken = '';
  const testCustomerEmail = `test_customer_${Date.now()}@csm.vn`;
  await testCase(
    '1.2 Đăng ký tài khoản cố tình truyền role=ADMIN -> Server ép về role=CUSTOMER',
    {
      expectedStatus: 201,
      assertFn: (d) => d.user?.role === 'CUSTOMER' && !!d.accessToken,
    },
    async () => {
      const res = await axios.post(`${BASE_URL}/auth/register`, {
        email: testCustomerEmail,
        password: 'Password@123',
        fullName: 'Khách Hàng Thử Role Admin',
        role: 'ADMIN',
        branch_id: 'br-01',
      });
      newCustomerToken = res.data.accessToken;
      newCustomerRefreshToken = res.data.refreshToken;
      return res;
    }
  );

  await testCase(
    '1.3 Đăng nhập tài khoản CUSTOMER vừa đăng ký',
    {
      expectedStatus: 201,
      assertFn: (d) => !!d.accessToken && d.user?.role === 'CUSTOMER',
    },
    async () => {
      return await axios.post(`${BASE_URL}/auth/login`, {
        email: testCustomerEmail,
        password: 'Password@123',
      });
    }
  );

  let adminAccessToken = '';
  let adminRefreshToken = '';
  await testCase(
    '1.4 Đăng nhập tài khoản ADMIN (seed account admin@csm.vn)',
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

  let customerAccessToken = '';
  await testCase(
    '1.5 Đăng nhập tài khoản CUSTOMER (seed account customer@csm.vn)',
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

  let managerAccessToken = '';
  await testCase(
    '1.6 Đăng nhập tài khoản BRANCH_MANAGER (seed account manager.q1@csm.vn tại br-01)',
    {
      expectedStatus: 201,
      assertFn: (d) => !!d.accessToken && d.user?.role === 'BRANCH_MANAGER',
    },
    async () => {
      const res = await axios.post(`${BASE_URL}/auth/login`, {
        email: 'manager.q1@csm.vn',
        password: 'Manager@123456',
      });
      managerAccessToken = res.data.accessToken;
      return res;
    }
  );

  await testCase(
    '1.7 Đăng nhập sai mật khẩu -> Bị từ chối 401 Unauthorized',
    {
      expectedStatus: 401,
      assertFn: (d) => d.statusCode === 401,
    },
    async () => {
      return await axios.post(`${BASE_URL}/auth/login`, {
        email: 'admin@csm.vn',
        password: 'SaiMatKhau@999',
      });
    }
  );

  await testCase(
    '1.8 Refresh token bằng Refresh Token hợp lệ -> Cấp Access Token mới (200 OK)',
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

  await testCase(
    '1.9 Refresh token từ chối Access Token (bảo mật type claim check -> 401)',
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

  await testCase(
    '1.10 Refresh token từ chối Refresh Token giả mạo/hỏng -> 401 Unauthorized',
    {
      expectedStatus: 401,
      assertFn: (d) => d.statusCode === 401,
    },
    async () => {
      return await axios.post(`${BASE_URL}/auth/refresh`, {
        refreshToken: 'invalid-token-tampered-xyz',
      });
    }
  );

  // ============================================================================
  // NHÓM 2: QUẢN LÝ CHI NHÁNH & TÌM KIẾM THEO CÔNG THỨC HAVERSINE
  // ============================================================================
  console.log('\n--- NHÓM 2: QUẢN LÝ CHI NHÁNH & HAVERSINE NEAREST ---');

  await testCase(
    '2.1 Haversine: Tìm chi nhánh gần nhất theo toạ độ GPS hợp lệ (GET /branches/nearest)',
    {
      expectedStatus: 200,
      assertFn: (d) => !!d.id && typeof d.distance_km === 'number' && d.name !== undefined,
    },
    async () => {
      return await axios.get(`${BASE_URL}/branches/nearest?lat=10.7769&lng=106.7009`);
    }
  );

  await testCase(
    '2.2 Haversine: Tìm chi nhánh gần nhất khi thiếu toạ độ lat/lng -> Từ chối 400 Bad Request',
    {
      expectedStatus: 400,
      assertFn: (d) => d.statusCode === 400,
    },
    async () => {
      return await axios.get(`${BASE_URL}/branches/nearest?lat=10.7769`);
    }
  );

  await testCase(
    '2.3 Haversine: Tìm chi nhánh gần nhất khi toạ độ vượt giới hạn (lat=999) -> Từ chối 400',
    {
      expectedStatus: 400,
      assertFn: (d) => d.statusCode === 400,
    },
    async () => {
      return await axios.get(`${BASE_URL}/branches/nearest?lat=999&lng=106.7009`);
    }
  );

  await testCase(
    '2.4 Lấy danh sách toàn bộ chi nhánh đang hoạt động (GET /branches)',
    {
      expectedStatus: 200,
      assertFn: (d) => Array.isArray(d) && d.length > 0 && d.every((b) => b.is_active === true),
    },
    async () => {
      return await axios.get(`${BASE_URL}/branches`);
    }
  );

  await testCase(
    '2.5 Lấy thông tin chi tiết chi nhánh theo ID hợp lệ (GET /branches/br-01)',
    {
      expectedStatus: 200,
      assertFn: (d) => d.id === 'br-01' && !!d.name,
    },
    async () => {
      return await axios.get(`${BASE_URL}/branches/br-01`);
    }
  );

  await testCase(
    '2.6 Lấy chi nhánh với ID không tồn tại (GET /branches/br-non-existent) -> Từ chối 404',
    {
      expectedStatus: 404,
      assertFn: (d) => d.statusCode === 404,
    },
    async () => {
      return await axios.get(`${BASE_URL}/branches/br-non-existent`);
    }
  );

  const testBranchId = `br-test-${Date.now()}`;
  await testCase(
    '2.7 Tạo chi nhánh kiểm thử mới bằng token ADMIN (POST /branches)',
    {
      expectedStatus: 201,
      assertFn: (d) => d.id === testBranchId && d.name === 'Chi Nhánh Kiểm Thử E2E',
    },
    async () => {
      return await axios.post(
        `${BASE_URL}/branches`,
        {
          id: testBranchId,
          name: 'Chi Nhánh Kiểm Thử E2E',
          address: '999 Đường Kiểm Thử, Q. Tân Bình, TP.HCM',
          latitude: 10.8000,
          longitude: 106.6500,
        },
        { headers: { Authorization: `Bearer ${adminAccessToken}` } }
      );
    }
  );

  await testCase(
    '2.8 CUSTOMER cố tạo chi nhánh mới -> Bị từ chối 403 Forbidden',
    {
      expectedStatus: 403,
      assertFn: (d) => d.statusCode === 403,
    },
    async () => {
      return await axios.post(
        `${BASE_URL}/branches`,
        {
          name: 'Chi Nhánh Hacker',
          address: '123 Fake Road',
        },
        { headers: { Authorization: `Bearer ${customerAccessToken}` } }
      );
    }
  );

  await testCase(
    '2.9 Cập nhật thông tin chi nhánh kiểm thử bằng token ADMIN (PUT /branches/:id)',
    {
      expectedStatus: 200,
      assertFn: (d) => d.name === 'Chi Nhánh Kiểm Thử E2E Đã Sửa',
    },
    async () => {
      return await axios.put(
        `${BASE_URL}/branches/${testBranchId}`,
        {
          name: 'Chi Nhánh Kiểm Thử E2E Đã Sửa',
        },
        { headers: { Authorization: `Bearer ${adminAccessToken}` } }
      );
    }
  );

  await testCase(
    '2.10 CUSTOMER cố cập nhật chi nhánh -> Bị từ chối 403 Forbidden',
    {
      expectedStatus: 403,
      assertFn: (d) => d.statusCode === 403,
    },
    async () => {
      return await axios.put(
        `${BASE_URL}/branches/${testBranchId}`,
        { name: 'Hacked Name' },
        { headers: { Authorization: `Bearer ${customerAccessToken}` } }
      );
    }
  );

  await testCase(
    '2.11 Xoá chi nhánh còn tồn kho hàng hoá (br-01) -> Bị từ chối 409 Conflict',
    {
      expectedStatus: 409,
      assertFn: (d) => d.statusCode === 409 && String(d.message).includes('còn tồn kho'),
    },
    async () => {
      return await axios.delete(`${BASE_URL}/branches/br-01`, {
        headers: { Authorization: `Bearer ${adminAccessToken}` },
      });
    }
  );

  await testCase(
    '2.12 Xoá mềm (vô hiệu hoá) chi nhánh kiểm thử trống bằng ADMIN -> Thành công 200 OK',
    {
      expectedStatus: 200,
      assertFn: (d) => d.success === true,
    },
    async () => {
      return await axios.delete(`${BASE_URL}/branches/${testBranchId}`, {
        headers: { Authorization: `Bearer ${adminAccessToken}` },
      });
    }
  );

  await testCase(
    '2.13 CUSTOMER cố xoá chi nhánh -> Bị từ chối 403 Forbidden',
    {
      expectedStatus: 403,
      assertFn: (d) => d.statusCode === 403,
    },
    async () => {
      return await axios.delete(`${BASE_URL}/branches/br-01`, {
        headers: { Authorization: `Bearer ${customerAccessToken}` },
      });
    }
  );

  // ============================================================================
  // NHÓM 3: THIẾT LẬP SẢN PHẨM, NHẬP KHO ĐA CHI NHÁNH & BẢO MẬT
  // ============================================================================
  console.log('\n--- NHÓM 3: SẢN PHẨM, NHẬP KHO ĐA CHI NHÁNH & BẢO MẬT ---');

  let testProduct = null;
  const branchId = 'br-01';
  const otherBranchId = 'br-02';

  await testCase(
    '3.1 Tạo sản phẩm mẫu kiểm thử bằng token ADMIN (POST /products)',
    {
      expectedStatus: 201,
      assertFn: (d) => !!d.id && d.base_price === 35000,
    },
    async () => {
      const res = await axios.post(
        `${BASE_URL}/products`,
        {
          sku: 'SKU-E2E-' + Date.now(),
          name: 'Trà Sữa Trân Châu CSM Kiểm Thử',
          base_price: 35000,
          description: 'Trà sữa tự nhiên đậm vị',
        },
        { headers: { Authorization: `Bearer ${adminAccessToken}` } }
      );
      testProduct = res.data;
      return res;
    }
  );

  const productId = testProduct.id;

  // 3.2 Nhập 100 sản phẩm vào kho chi nhánh br-01
  await testCase(
    '3.2 Nhập 100 sản phẩm vào kho chi nhánh br-01 bằng token ADMIN (POST /inventory/add-stock)',
    {
      expectedStatus: 201,
      assertFn: (d) => d.quantity >= 100,
    },
    async () => {
      return await axios.post(
        `${BASE_URL}/inventory/add-stock`,
        {
          branchId,
          productId,
          quantity: 100,
        },
        { headers: { Authorization: `Bearer ${adminAccessToken}` } }
      );
    }
  );

  // 3.2b Nhập 50 sản phẩm vào kho chi nhánh br-02 (để phục vụ test khoá chi nhánh)
  await testCase(
    '3.2b Nhập 50 sản phẩm vào kho chi nhánh br-02 bằng token ADMIN (POST /inventory/add-stock)',
    {
      expectedStatus: 201,
      assertFn: (d) => d.quantity >= 50,
    },
    async () => {
      return await axios.post(
        `${BASE_URL}/inventory/add-stock`,
        {
          branchId: otherBranchId,
          productId,
          quantity: 50,
        },
        { headers: { Authorization: `Bearer ${adminAccessToken}` } }
      );
    }
  );

  await testCase(
    '3.3 Token CUSTOMER + header x-user-role: ADMIN gọi POST /inventory/add-stock -> Phải 403',
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

  await testCase(
    '3.4 Token CUSTOMER thông thường gọi POST /inventory/add-stock -> Bị từ chối 403 Forbidden',
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
          quantity: 10,
        },
        { headers: { Authorization: `Bearer ${customerAccessToken}` } }
      );
    }
  );

  await testCase(
    '3.5 BRANCH_MANAGER nhập kho cho chi nhánh khác chi nhánh quản lý (br-02 != br-01) -> Phải 403',
    {
      expectedStatus: 403,
      assertFn: (d) => d.statusCode === 403,
    },
    async () => {
      return await axios.post(
        `${BASE_URL}/inventory/add-stock`,
        {
          branchId: otherBranchId,
          productId,
          quantity: 10,
        },
        { headers: { Authorization: `Bearer ${managerAccessToken}` } }
      );
    }
  );

  // ============================================================================
  // NHÓM 4: ĐỒNG THỜI (CONCURRENCY) & IDEMPOTENCY KHO HÀNG
  // ============================================================================
  console.log('\n--- NHÓM 4: ĐỒNG THỜI & IDEMPOTENCY KHO HÀNG ---');

  await testCase(
    '4.1 Idempotency kho: 2 request reserve-stock đồng thời cùng referenceId chỉ giữ hàng 1 lần',
    {
      expectedStatus: 200,
      assertFn: (d) => d.request_1?.success === true && d.request_2?.success === true,
    },
    async () => {
      const dupRefId = 'race-order-' + Date.now();
      const req1 = axios.post(
        `${BASE_URL}/inventory/reserve-stock`,
        {
          branchId,
          referenceId: dupRefId,
          items: [{ productId, quantity: 2 }],
        },
        { headers: { Authorization: `Bearer ${adminAccessToken}` } }
      );
      const req2 = axios.post(
        `${BASE_URL}/inventory/reserve-stock`,
        {
          branchId,
          referenceId: dupRefId,
          items: [{ productId, quantity: 2 }],
        },
        { headers: { Authorization: `Bearer ${adminAccessToken}` } }
      );
      const [res1, res2] = await Promise.all([req1, req2]);
      return {
        status: 200,
        data: {
          request_1: res1.data,
          request_2: res2.data,
        },
      };
    }
  );

  await testCase(
    '4.2 Concurrency kho: 5 request reserve-stock đồng thời với referenceId khác nhau đều thành công',
    {
      expectedStatus: 200,
      assertFn: (d) => d.every((r) => r.success === true),
    },
    async () => {
      const concurrentRequests = Array.from({ length: 5 }).map((_, idx) =>
        axios.post(
          `${BASE_URL}/inventory/reserve-stock`,
          {
            branchId,
            referenceId: `concurrency-ref-${Date.now()}-${idx}`,
            items: [{ productId, quantity: 1 }],
          },
          { headers: { Authorization: `Bearer ${adminAccessToken}` } }
        )
      );
      const responses = await Promise.all(concurrentRequests);
      return {
        status: 200,
        data: responses.map((r) => r.data),
      };
    }
  );

  await testCase(
    '4.3 Đặt hàng khi vượt quá tồn kho khả dụng (số lượng 999999) -> Từ chối 400 Bad Request',
    {
      expectedStatus: 400,
      assertFn: (d) => d.statusCode === 400,
    },
    async () => {
      return await axios.post(
        `${BASE_URL}/orders`,
        {
          branchId,
          items: [{ productId, quantity: 999999 }],
          shippingAddress: '123 Test Street',
          paymentMethod: 'COD',
        },
        { headers: { Authorization: `Bearer ${customerAccessToken}` } }
      );
    }
  );

  // ============================================================================
  // NHÓM 5: VALIDATION ĐẶT HÀNG, STATE MACHINE VÀ SAGA LIFECYCLE
  // ============================================================================
  console.log('\n--- NHÓM 5: VALIDATION ĐẶT HÀNG, STATE MACHINE & SAGA LIFECYCLE ---');

  // 5.1a POST /orders validation: thiếu items -> 400
  await testCase(
    '5.1a POST /orders validation: thiếu items -> Từ chối 400 Bad Request',
    {
      expectedStatus: 400,
      assertFn: (d) => d.statusCode === 400,
    },
    async () => {
      return await axios.post(
        `${BASE_URL}/orders`,
        {
          branchId,
          items: [],
          shippingAddress: '123 Validation St',
          paymentMethod: 'COD',
        },
        { headers: { Authorization: `Bearer ${customerAccessToken}` } }
      );
    }
  );

  // 5.1b POST /orders validation: thiếu branchId -> 400
  await testCase(
    '5.1b POST /orders validation: thiếu branchId -> Từ chối 400 Bad Request',
    {
      expectedStatus: 400,
      assertFn: (d) => d.statusCode === 400,
    },
    async () => {
      return await axios.post(
        `${BASE_URL}/orders`,
        {
          items: [{ productId, quantity: 1 }],
          shippingAddress: '123 Validation St',
          paymentMethod: 'COD',
        },
        { headers: { Authorization: `Bearer ${customerAccessToken}` } }
      );
    }
  );

  // 5.1c POST /orders validation: quantity <= 0 -> 400
  await testCase(
    '5.1c POST /orders validation: quantity <= 0 -> Từ chối 400 Bad Request',
    {
      expectedStatus: 400,
      assertFn: (d) => d.statusCode === 400,
    },
    async () => {
      return await axios.post(
        `${BASE_URL}/orders`,
        {
          branchId,
          items: [{ productId, quantity: 0 }],
          shippingAddress: '123 Validation St',
          paymentMethod: 'COD',
        },
        { headers: { Authorization: `Bearer ${customerAccessToken}` } }
      );
    }
  );

  // 5.1d POST /orders validation: product không tồn tại -> 404
  await testCase(
    '5.1d POST /orders validation: product không tồn tại -> Từ chối 404 Not Found',
    {
      expectedStatus: 404,
      assertFn: (d) => d.statusCode === 404,
    },
    async () => {
      return await axios.post(
        `${BASE_URL}/orders`,
        {
          branchId,
          items: [{ productId: '00000000-0000-0000-0000-000000000000', quantity: 1 }],
          shippingAddress: '123 Validation St',
          paymentMethod: 'COD',
        },
        { headers: { Authorization: `Bearer ${customerAccessToken}` } }
      );
    }
  );

  // 5.1e POST /orders validation: branchId không tồn tại -> 400
  await testCase(
    '5.1e POST /orders validation: branchId không tồn tại (br-99999) -> Bị từ chối 400 Bad Request',
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
        { headers: { Authorization: `Bearer ${customerAccessToken}` } }
      );
    }
  );

  // 5.2 Tạo Đơn Hàng 1 (COD, số lượng 3) -> Khởi tạo ở trạng thái PENDING
  let order1Id = '';
  await testCase(
    '5.2 Tạo Đơn Hàng 1 (COD, số lượng 3) -> Khởi tạo ở trạng thái PENDING',
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
        { headers: { Authorization: `Bearer ${customerAccessToken}` } }
      );
      order1Id = res.data.orderId;
      return res;
    }
  );

  let stockBeforeConfirm = null;
  await testCase(
    '5.3 [Trước duyệt] Tồn kho br-01 khi Đơn 1 đang PENDING (reserved_quantity tăng 3 đơn vị)',
    {
      expectedStatus: 200,
      assertFn: (d) => d.reserved_quantity >= 3,
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

  await testCase(
    '5.4 ADMIN duyệt Đơn 1: PENDING -> CONFIRMED (kích hoạt confirm-deduct)',
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

  let stockAfterConfirm = null;
  await testCase(
    '5.5 [Sau duyệt] Tồn kho br-01 sau khi CONFIRMED (quantity giảm 3, reserved_quantity giải phóng)',
    {
      expectedStatus: 200,
      assertFn: (d) => d.so_luong_thuc_tru === 3,
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

  await testCase(
    '5.6 [Bản ghi StockTransaction] Xác nhận các giao dịch RESERVE và OUT của Đơn 1',
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

  // 5.7a Chuyển trạng thái sai quy tắc: CONFIRMED -> PENDING -> 400
  await testCase(
    '5.7a Chuyển trạng thái sai quy tắc: CONFIRMED -> PENDING -> Từ chối 400 Bad Request',
    {
      expectedStatus: 400,
      assertFn: (d) => d.statusCode === 400,
    },
    async () => {
      return await axios.patch(
        `${BASE_URL}/orders/${order1Id}/status`,
        { status: 'PENDING' },
        { headers: { Authorization: `Bearer ${adminAccessToken}` } }
      );
    }
  );

  // 5.7b State machine: CONFIRMED -> PAID (bởi ADMIN) -> 200 OK
  await testCase(
    '5.7b State machine: CONFIRMED -> PAID bởi ADMIN -> Thành công 200 OK',
    {
      expectedStatus: 200,
      assertFn: (d) => d.status === 'PAID',
    },
    async () => {
      return await axios.patch(
        `${BASE_URL}/orders/${order1Id}/status`,
        { status: 'PAID' },
        { headers: { Authorization: `Bearer ${adminAccessToken}` } }
      );
    }
  );

  // 5.7c State machine: PAID -> SHIPPED (bởi ADMIN) -> 200 OK
  await testCase(
    '5.7c State machine: PAID -> SHIPPED bởi ADMIN -> Thành công 200 OK',
    {
      expectedStatus: 200,
      assertFn: (d) => d.status === 'SHIPPED',
    },
    async () => {
      return await axios.patch(
        `${BASE_URL}/orders/${order1Id}/status`,
        { status: 'SHIPPED' },
        { headers: { Authorization: `Bearer ${adminAccessToken}` } }
      );
    }
  );

  // 5.7d State machine: SHIPPED là trạng thái cuối (không huỷ được) -> Từ chối 400 Bad Request
  await testCase(
    '5.7d State machine: SHIPPED là trạng thái cuối (cố chuyển sang CANCELLED) -> Từ chối 400 Bad Request',
    {
      expectedStatus: 400,
      assertFn: (d) => d.statusCode === 400,
    },
    async () => {
      return await axios.patch(
        `${BASE_URL}/orders/${order1Id}/status`,
        { status: 'CANCELLED' },
        { headers: { Authorization: `Bearer ${adminAccessToken}` } }
      );
    }
  );

  await testCase(
    '5.8 CUSTOMER cố huỷ đơn khi đã qua PENDING -> Bị từ chối 403 Forbidden',
    {
      expectedStatus: 403,
      assertFn: (d) => d.statusCode === 403,
    },
    async () => {
      return await axios.patch(
        `${BASE_URL}/orders/${order1Id}/status`,
        { status: 'CANCELLED' },
        { headers: { Authorization: `Bearer ${customerAccessToken}` } }
      );
    }
  );

  let order2Id = '';
  await testCase(
    '5.9 Tạo Đơn Hàng 2 (COD, số lượng 5) để thử nghiệm huỷ đơn PENDING',
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
        { headers: { Authorization: `Bearer ${customerAccessToken}` } }
      );
      order2Id = res.data.orderId;
      return res;
    }
  );

  let stockBeforeCancel = null;
  await testCase(
    '5.10 [Trước huỷ] Tồn kho khi Đơn 2 đang PENDING (reserved_quantity tăng 5 đơn vị)',
    {
      expectedStatus: 200,
      assertFn: (d) => d.reserved_quantity >= 5,
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

  await testCase(
    '5.11 CUSTOMER huỷ Đơn 2 của chính mình: PENDING -> CANCELLED (kích hoạt release-stock)',
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

  let stockAfterCancel = null;
  await testCase(
    '5.12 [Sau huỷ] Tồn kho sau khi huỷ Đơn 2 (reserved_quantity đã được giải phóng hoàn toàn)',
    {
      expectedStatus: 200,
      assertFn: (d) => d.so_luong_giai_phong === 5,
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

  await testCase(
    '5.13 [Bản ghi StockTransaction] Xác nhận các giao dịch RESERVE và CANCEL_RESERVE của Đơn 2',
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

  // 5.13b State machine: CANCELLED là trạng thái cuối (không thể chuyển sang trạng thái khác)
  await testCase(
    '5.13b State machine: CANCELLED là trạng thái cuối (cố chuyển sang CONFIRMED) -> Từ chối 400 Bad Request',
    {
      expectedStatus: 400,
      assertFn: (d) => d.statusCode === 400,
    },
    async () => {
      return await axios.patch(
        `${BASE_URL}/orders/${order2Id}/status`,
        { status: 'CONFIRMED' },
        { headers: { Authorization: `Bearer ${adminAccessToken}` } }
      );
    }
  );

  await testCase(
    '5.14 Mô phỏng Saga bù trừ: Giữ kho -> Giả lập lưu đơn lỗi -> Kích hoạt release-stock khôi phục kho',
    {
      expectedStatus: 200,
      assertFn: (d) => d.kho_duoc_phuc_hoi === true && d.reserved_sau_khi_bu_tru === d.reserved_truoc_khi_giu,
    },
    async () => {
      const simRefId = 'sim-db-fail-' + Date.now();

      const beforeStockRes = await axios.get(`${BASE_URL}/inventory/product/${productId}`);
      const beforeStock = beforeStockRes.data.find((b) => b.branch_id === branchId);

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

  // 5.15a State machine: BRANCH_MANAGER cập nhật status chi nhánh của mình PENDING -> CONFIRMED -> OK 200
  let managerUpdateOrderId = '';
  await testCase(
    '5.15a State machine: BRANCH_MANAGER br-01 cập nhật đơn PENDING -> CONFIRMED -> Thành công 200 OK',
    {
      expectedStatus: 200,
      assertFn: (d) => d.status === 'CONFIRMED',
    },
    async () => {
      const res = await axios.post(
        `${BASE_URL}/orders`,
        {
          branchId: 'br-01',
          items: [{ productId, quantity: 1 }],
          shippingAddress: 'Manager Test Address',
          paymentMethod: 'COD',
        },
        { headers: { Authorization: `Bearer ${customerAccessToken}` } }
      );
      managerUpdateOrderId = res.data.orderId;

      return await axios.patch(
        `${BASE_URL}/orders/${managerUpdateOrderId}/status`,
        { status: 'CONFIRMED' },
        { headers: { Authorization: `Bearer ${managerAccessToken}` } }
      );
    }
  );

  // 5.15b State machine: ADMIN cập nhật status đơn CONFIRMED -> PAID -> OK 200
  await testCase(
    '5.15b State machine: ADMIN cập nhật status đơn CONFIRMED -> PAID -> Thành công 200 OK',
    {
      expectedStatus: 200,
      assertFn: (d) => d.status === 'PAID',
    },
    async () => {
      return await axios.patch(
        `${BASE_URL}/orders/${managerUpdateOrderId}/status`,
        { status: 'PAID' },
        { headers: { Authorization: `Bearer ${adminAccessToken}` } }
      );
    }
  );

  // ============================================================================
  // NHÓM 6: CSM-29 ORDER QUERY APIS, LỌC ĐA TIÊU CHÍ & KHOÁ CHI NHÁNH
  // ============================================================================
  console.log('\n--- NHÓM 6: CSM-29 ORDER QUERY APIS & TEST KHOÁ CHI NHÁNH ---');

  let csmOrderCodId = '';
  await testCase(
    'CSM-29 [1.0]: Tạo đơn hàng COD mới cho khách hàng để kiểm thử truy vấn độc lập (status ban đầu: PENDING)',
    {
      expectedStatus: 201,
      assertFn: (d) => !!d.orderId && d.status === 'PENDING',
    },
    async () => {
      const res = await axios.post(
        `${BASE_URL}/orders`,
        {
          branchId,
          items: [{ productId, quantity: 1 }],
          shippingAddress: '99 CSM-29 Test Street',
          paymentMethod: 'COD',
        },
        { headers: { Authorization: `Bearer ${customerAccessToken}` } }
      );
      csmOrderCodId = res.data.orderId;
      return res;
    }
  );

  await testCase(
    'CSM-29 [1.1a]: GET /orders/my - Trả về đơn của khách hàng dạng chuẩn { items, total, page, limit, totalPages }',
    {
      expectedStatus: 200,
      assertFn: (d) =>
        Array.isArray(d.items) &&
        typeof d.total === 'number' &&
        d.page === 1 &&
        d.limit === 10 &&
        typeof d.totalPages === 'number' &&
        d.items.length >= 1,
    },
    async () => {
      return await axios.get(`${BASE_URL}/orders/my?page=1&limit=10`, {
        headers: { Authorization: `Bearer ${customerAccessToken}` },
      });
    }
  );

  await testCase(
    'CSM-29 [1.1b]: GET /orders/my?status=PENDING - Lọc theo trạng thái PENDING thành công',
    {
      expectedStatus: 200,
      assertFn: (d) => Array.isArray(d.items) && d.items.length >= 1 && d.items.every((o) => o.status === 'PENDING'),
    },
    async () => {
      return await axios.get(`${BASE_URL}/orders/my?status=PENDING`, {
        headers: { Authorization: `Bearer ${customerAccessToken}` },
      });
    }
  );

  await testCase(
    'CSM-29 [1.1c]: ADMIN xác nhận đơn hàng COD của CSM-29: PENDING -> CONFIRMED (xác nhận trạng thái rõ ràng)',
    {
      expectedStatus: 200,
      assertFn: (d) => d.status === 'CONFIRMED',
    },
    async () => {
      return await axios.patch(
        `${BASE_URL}/orders/${csmOrderCodId}/status`,
        { status: 'CONFIRMED' },
        { headers: { Authorization: `Bearer ${adminAccessToken}` } }
      );
    }
  );

  await testCase(
    'CSM-29 [1.1d]: GET /orders/my?status=CONFIRMED - Lọc theo trạng thái CONFIRMED thành công',
    {
      expectedStatus: 200,
      assertFn: (d) => Array.isArray(d.items) && d.items.every((o) => o.status === 'CONFIRMED'),
    },
    async () => {
      return await axios.get(`${BASE_URL}/orders/my?status=CONFIRMED`, {
        headers: { Authorization: `Bearer ${customerAccessToken}` },
      });
    }
  );

  await testCase(
    'CSM-29 [1.5]: GET /orders/my?status=INVALID_STATUS - Từ chối 400 Bad Request',
    {
      expectedStatus: 400,
      assertFn: (d) => d.statusCode === 400,
    },
    async () => {
      return await axios.get(`${BASE_URL}/orders/my?status=INVALID_STATUS`, {
        headers: { Authorization: `Bearer ${customerAccessToken}` },
      });
    }
  );

  await testCase(
    'CSM-29 [1.2a]: GET /orders - CUSTOMER gọi danh sách quản trị -> Bị từ chối 403 Forbidden',
    {
      expectedStatus: 403,
      assertFn: (d) => d.statusCode === 403,
    },
    async () => {
      return await axios.get(`${BASE_URL}/orders`, {
        headers: { Authorization: `Bearer ${customerAccessToken}` },
      });
    }
  );

  // 6.2b GET /orders (ADMIN): phân trang limit=1
  await testCase(
    'CSM-29 [1.2b]: GET /orders (ADMIN) - Phân trang limit=1 trả về đúng 1 đơn hàng và totalPages chuẩn',
    {
      expectedStatus: 200,
      assertFn: (d) => Array.isArray(d.items) && d.items.length === 1 && d.limit === 1 && typeof d.totalPages === 'number',
    },
    async () => {
      return await axios.get(`${BASE_URL}/orders?page=1&limit=1`, {
        headers: { Authorization: `Bearer ${adminAccessToken}` },
      });
    }
  );

  // 6.2c GET /orders (ADMIN): lọc status
  await testCase(
    'CSM-29 [1.2c]: GET /orders (ADMIN) - Lọc theo status=CONFIRMED',
    {
      expectedStatus: 200,
      assertFn: (d) => Array.isArray(d.items) && d.items.every((o) => o.status === 'CONFIRMED'),
    },
    async () => {
      return await axios.get(`${BASE_URL}/orders?status=CONFIRMED`, {
        headers: { Authorization: `Bearer ${adminAccessToken}` },
      });
    }
  );

  // 6.2d GET /orders (ADMIN): lọc branchId
  await testCase(
    'CSM-29 [1.2d]: GET /orders (ADMIN) - Lọc theo branchId=br-01',
    {
      expectedStatus: 200,
      assertFn: (d) => Array.isArray(d.items) && d.items.every((o) => o.branch_id === 'br-01'),
    },
    async () => {
      return await axios.get(`${BASE_URL}/orders?branchId=br-01`, {
        headers: { Authorization: `Bearer ${adminAccessToken}` },
      });
    }
  );

  // 6.2e GET /orders (ADMIN): tìm theo search (mã đơn)
  await testCase(
    'CSM-29 [1.2e]: GET /orders (ADMIN) - Tìm kiếm theo search mã đơn hàng',
    {
      expectedStatus: 200,
      assertFn: (d) => Array.isArray(d.items) && d.items.some((o) => o.id === csmOrderCodId),
    },
    async () => {
      const searchKey = csmOrderCodId.slice(0, 8);
      return await axios.get(`${BASE_URL}/orders?search=${searchKey}`, {
        headers: { Authorization: `Bearer ${adminAccessToken}` },
      });
    }
  );

  // 6.2f GET /orders (ADMIN): lọc khoảng ngày hợp lệ
  await testCase(
    'CSM-29 [1.2f]: GET /orders (ADMIN) - Lọc theo khoảng ngày hợp lệ (fromDate & toDate) -> 200 OK',
    {
      expectedStatus: 200,
      assertFn: (d) => Array.isArray(d.items) && typeof d.total === 'number',
    },
    async () => {
      const now = new Date();
      const fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const toDate = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
      return await axios.get(`${BASE_URL}/orders?fromDate=${fromDate}&toDate=${toDate}`, {
        headers: { Authorization: `Bearer ${adminAccessToken}` },
      });
    }
  );

  // 6.2g GET /orders (ADMIN): lọc khoảng ngày không hợp lệ (sai định dạng) -> 400
  await testCase(
    'CSM-29 [1.2g]: GET /orders (ADMIN) - Lọc khoảng ngày sai định dạng (fromDate=invalid) -> Từ chối 400 Bad Request',
    {
      expectedStatus: 400,
      assertFn: (d) => d.statusCode === 400,
    },
    async () => {
      return await axios.get(`${BASE_URL}/orders?fromDate=invalid-date-format`, {
        headers: { Authorization: `Bearer ${adminAccessToken}` },
      });
    }
  );

  // 6.2h GET /orders (ADMIN): lọc khoảng ngày không hợp lệ (fromDate > toDate) -> 400
  await testCase(
    'CSM-29 [1.2h]: GET /orders (ADMIN) - Lọc khoảng ngày vô lý (fromDate > toDate) -> Từ chối 400 Bad Request',
    {
      expectedStatus: 400,
      assertFn: (d) => d.statusCode === 400,
    },
    async () => {
      return await axios.get(`${BASE_URL}/orders?fromDate=2026-12-31&toDate=2026-01-01`, {
        headers: { Authorization: `Bearer ${adminAccessToken}` },
      });
    }
  );

  // 6.2i GET /orders (ADMIN): xem toàn bộ đơn kèm phân trang
  let adminTotalOrders = 0;
  await testCase(
    'CSM-29 [1.2i]: GET /orders - ADMIN xem toàn bộ đơn kèm phân trang chuẩn { items, total, page, limit, totalPages }',
    {
      expectedStatus: 200,
      assertFn: (d) => {
        adminTotalOrders = d.total;
        return Array.isArray(d.items) && typeof d.total === 'number' && typeof d.totalPages === 'number' && d.total >= 1;
      },
    },
    async () => {
      return await axios.get(`${BASE_URL}/orders?page=1&limit=10`, {
        headers: { Authorization: `Bearer ${adminAccessToken}` },
      });
    }
  );

  // ============================================================================
  // TEST KHOÁ CHI NHÁNH CHO BRANCH_MANAGER (YÊU CẦU 5)
  // ============================================================================
  let orderBr02Id = '';
  await testCase(
    '5. (Khoá chi nhánh [5.1]): Tạo đơn hàng tại chi nhánh khác (br-02) bằng token CUSTOMER',
    {
      expectedStatus: 201,
      assertFn: (d) => !!d.orderId && d.status === 'PENDING',
    },
    async () => {
      const res = await axios.post(
        `${BASE_URL}/orders`,
        {
          branchId: otherBranchId,
          items: [{ productId, quantity: 1 }],
          shippingAddress: '456 Branch 02 Street',
          paymentMethod: 'COD',
        },
        { headers: { Authorization: `Bearer ${customerAccessToken}` } }
      );
      orderBr02Id = res.data.orderId;
      return res;
    }
  );

  await testCase(
    '5. (Khoá chi nhánh [5.2]): MANAGER br-01 gọi GET /orders KHÔNG thấy đơn br-02 (total < ADMIN)',
    {
      expectedStatus: 200,
      assertFn: (d) => {
        const hasBr02Order = d.items.some((o) => o.id === orderBr02Id || o.branch_id === otherBranchId);
        return !hasBr02Order && d.items.every((o) => o.branch_id === 'br-01');
      },
    },
    async () => {
      return await axios.get(`${BASE_URL}/orders?branchId=br-02`, {
        headers: { Authorization: `Bearer ${managerAccessToken}` },
      });
    }
  );

  await testCase(
    '5. (Khoá chi nhánh [5.3]): MANAGER br-01 gọi GET /orders/:id của đơn br-02 -> Bị từ chối 403 Forbidden',
    {
      expectedStatus: 403,
      assertFn: (d) => d.statusCode === 403,
    },
    async () => {
      return await axios.get(`${BASE_URL}/orders/${orderBr02Id}`, {
        headers: { Authorization: `Bearer ${managerAccessToken}` },
      });
    }
  );

  await testCase(
    '5. (Khoá chi nhánh [5.4]): ADMIN gọi GET /orders/:id của đơn br-02 -> Thành công 200 OK',
    {
      expectedStatus: 200,
      assertFn: (d) => d.id === orderBr02Id && d.branch_id === otherBranchId,
    },
    async () => {
      return await axios.get(`${BASE_URL}/orders/${orderBr02Id}`, {
        headers: { Authorization: `Bearer ${adminAccessToken}` },
      });
    }
  );

  await testCase(
    'CSM-29 [1.4a]: GET /orders/:id - CUSTOMER xem đơn người khác -> Bị từ chối 403 Forbidden',
    {
      expectedStatus: 403,
      assertFn: (d) => d.statusCode === 403,
    },
    async () => {
      return await axios.get(`${BASE_URL}/orders/${csmOrderCodId}`, {
        headers: { Authorization: `Bearer ${newCustomerToken}` },
      });
    }
  );

  await testCase(
    'CSM-29 [1.4b]: GET /orders/:id - CUSTOMER xem đơn của chính mình -> Thành công 200 OK',
    {
      expectedStatus: 200,
      assertFn: (d) => d.id === csmOrderCodId && Array.isArray(d.items) && d.status === 'CONFIRMED',
    },
    async () => {
      return await axios.get(`${BASE_URL}/orders/${csmOrderCodId}`, {
        headers: { Authorization: `Bearer ${customerAccessToken}` },
      });
    }
  );

  // ============================================================================
  // NHÓM 7: KIỂM THỬ LUỒNG THANH TOÁN MÔ PHỎNG & BẢO MẬT CREATE PAYMENT
  // ============================================================================
  console.log('\n--- NHÓM 7: THANH TOÁN MÔ PHỎNG & BẢO MẬT CREATE PAYMENT ---');

  let orderOnlineId = '';
  let onlineToken = '';
  let orderCodId = '';

  // 7.1a POST /payments/create: không có JWT -> 401
  await testCase(
    '1. (Create Payment [1.1]): POST /payments/create không có JWT -> Từ chối 401 Unauthorized',
    {
      expectedStatus: 401,
      assertFn: (d) => d.statusCode === 401,
    },
    async () => {
      return await axios.post(`${BASE_URL}/payments/create`, {
        orderId: csmOrderCodId,
        amount: 35000,
        method: 'MOMO',
      });
    }
  );

  // 7.1b POST /payments/create: JWT người khác (không phải ADMIN, không phải chủ đơn) -> 403
  await testCase(
    '1. (Create Payment [1.2]): POST /payments/create bằng JWT người khác -> Bị từ chối 403 Forbidden',
    {
      expectedStatus: 403,
      assertFn: (d) => d.statusCode === 403,
    },
    async () => {
      return await axios.post(
        `${BASE_URL}/payments/create`,
        {
          orderId: csmOrderCodId,
          amount: 35000,
          method: 'MOMO',
        },
        { headers: { Authorization: `Bearer ${newCustomerToken}` } }
      );
    }
  );

  // 7.1c POST /payments/create: chủ đơn gọi -> 201 Created
  await testCase(
    '1. (Create Payment [1.3]): POST /payments/create bằng chính chủ đơn -> Thành công 201 Created',
    {
      expectedStatus: 201,
      assertFn: (d) => d.success === true && !!d.paymentUrl && !!d.token,
    },
    async () => {
      return await axios.post(
        `${BASE_URL}/payments/create`,
        {
          orderId: csmOrderCodId,
          amount: 35000,
          method: 'MOMO',
        },
        { headers: { Authorization: `Bearer ${customerAccessToken}` } }
      );
    }
  );

  // 7.1d POST /payments/create: ADMIN gọi -> 201 Created
  await testCase(
    '1. (Create Payment [1.4]): POST /payments/create bằng token ADMIN -> Thành công 201 Created',
    {
      expectedStatus: 201,
      assertFn: (d) => d.success === true && !!d.paymentUrl && !!d.token,
    },
    async () => {
      return await axios.post(
        `${BASE_URL}/payments/create`,
        {
          orderId: csmOrderCodId,
          amount: 35000,
          method: 'MOMO',
        },
        { headers: { Authorization: `Bearer ${adminAccessToken}` } }
      );
    }
  );

  // 2.1 Tạo đơn hàng online MOMO nhận link thanh toán mô phỏng chứa JWT token
  await testCase(
    'Giai đoạn 2 [2.1]: Tạo đơn hàng online MOMO nhận link thanh toán mô phỏng chứa JWT token',
    {
      expectedStatus: 201,
      assertFn: (d) => {
        if (!d.orderId || !d.paymentUrl || d.status !== 'PENDING') return false;
        try {
          const parsed = new URL(d.paymentUrl);
          const t = parsed.searchParams.get('token');
          if (!t) return false;
          onlineToken = t;
          return true;
        } catch (e) {
          return false;
        }
      },
    },
    async () => {
      const res = await axios.post(
        `${BASE_URL}/orders`,
        {
          branchId,
          items: [{ productId, quantity: 2 }],
          shippingAddress: '789 Nguyễn Huệ, Q1',
          paymentMethod: 'MOMO',
        },
        { headers: { Authorization: `Bearer ${customerAccessToken}` } }
      );
      orderOnlineId = res.data.orderId;
      return res;
    }
  );

  await testCase(
    'Giai đoạn 2 [2.2a]: GET trang HTML xác nhận mô phỏng thanh toán hợp lệ (200 OK)',
    {
      expectedStatus: 200,
      assertFn: (d) => typeof d === 'string' && (d.includes('Mô phỏng Cổng Thanh toán') || d.includes('Xác nhận thanh toán')),
    },
    async () => {
      return await axios.get(
        `${BASE_URL}/payments/simulate-success/${orderOnlineId}?token=${onlineToken}`
      );
    }
  );

  await testCase(
    'Giai đoạn 2 [2.2b]: Xác nhận sau khi GET HTML mô phỏng, đơn hàng vẫn ở trạng thái PENDING (chưa bị thanh toán)',
    {
      expectedStatus: 200,
      assertFn: (d) => d.id === orderOnlineId && d.status === 'PENDING',
    },
    async () => {
      return await axios.get(`${BASE_URL}/orders/${orderOnlineId}`, {
        headers: { Authorization: `Bearer ${customerAccessToken}` },
      });
    }
  );

  await testCase(
    'Giai đoạn 2 [2.3]: Token sai hoặc hỏng -> Từ chối 401 Unauthorized',
    {
      expectedStatus: 401,
      assertFn: (d) => d.statusCode === 401,
    },
    async () => {
      return await axios.post(`${BASE_URL}/payments/simulate-success`, {
        orderId: orderOnlineId,
        token: 'invalid-corrupted-token-xyz',
      });
    }
  );

  await testCase(
    'Giai đoạn 2 [2.4]: Token đã hết hạn -> Từ chối 401 Unauthorized',
    {
      expectedStatus: 401,
      assertFn: (d) => d.statusCode === 401,
    },
    async () => {
      const expiredToken = jwt.sign(
        { orderId: orderOnlineId },
        PAYMENT_SIMULATION_SECRET,
        { expiresIn: '-1s' }
      );
      return await axios.post(`${BASE_URL}/payments/simulate-success`, {
        orderId: orderOnlineId,
        token: expiredToken,
      });
    }
  );

  await testCase(
    'Giai đoạn 2 [2.5]: Token của đơn hàng khác (mismatched) -> Từ chối 403 Forbidden',
    {
      expectedStatus: 403,
      assertFn: (d) => d.statusCode === 403,
    },
    async () => {
      const mismatchedToken = jwt.sign(
        { orderId: '00000000-0000-0000-0000-000000000000' },
        PAYMENT_SIMULATION_SECRET,
        { expiresIn: '10m' }
      );
      return await axios.post(`${BASE_URL}/payments/simulate-success`, {
        orderId: orderOnlineId,
        token: mismatchedToken,
      });
    }
  );

  await testCase(
    'Giai đoạn 2 [2.6a]: Tạo đơn hàng COD để kiểm thử bảo mật',
    {
      expectedStatus: 201,
      assertFn: (d) => !!d.orderId && d.status === 'PENDING',
    },
    async () => {
      const res = await axios.post(
        `${BASE_URL}/orders`,
        {
          branchId,
          items: [{ productId, quantity: 1 }],
          shippingAddress: '123 COD Street',
          paymentMethod: 'COD',
        },
        { headers: { Authorization: `Bearer ${customerAccessToken}` } }
      );
      orderCodId = res.data.orderId;
      return res;
    }
  );

  await testCase(
    'Giai đoạn 2 [2.6b]: Gọi simulate-success cho đơn hàng COD -> Từ chối 400 Bad Request',
    {
      expectedStatus: 400,
      assertFn: (d) => d.statusCode === 400,
    },
    async () => {
      const validCodToken = jwt.sign(
        { orderId: orderCodId },
        PAYMENT_SIMULATION_SECRET,
        { expiresIn: '10m' }
      );
      return await axios.post(`${BASE_URL}/payments/simulate-success`, {
        orderId: orderCodId,
        token: validCodToken,
      });
    }
  );

  let stockBeforeMomo = 0;
  await testCase(
    'Giai đoạn 2 [2.7a]: Ghi nhận tồn kho chi nhánh trước khi thanh toán đơn online MOMO',
    {
      expectedStatus: 200,
      assertFn: (d) => Array.isArray(d) && d.length > 0,
    },
    async () => {
      const res = await axios.get(`${BASE_URL}/inventory/branch/${branchId}`);
      const item = res.data.find((p) => p.product_id === productId);
      stockBeforeMomo = item?.quantity || 0;
      return res;
    }
  );

  await testCase(
    'Giai đoạn 2 [2.7b]: Kích hoạt mô phỏng thanh toán online LẦN 1 -> Đơn chuyển CONFIRMED & PAID và trừ kho',
    {
      expectedStatus: 200,
      assertFn: (d) => d.success === true && d.status === 'PAID' && d.idempotent === false,
    },
    async () => {
      return await axios.post(`${BASE_URL}/payments/simulate-success`, {
        orderId: orderOnlineId,
        token: onlineToken,
      });
    }
  );

  let stockAfterMomo1 = 0;
  await testCase(
    'Giai đoạn 2 [2.7c]: Xác nhận tồn kho thực tế đã bị trừ 2 đơn vị sau LẦN 1 thanh toán thành công',
    {
      expectedStatus: 200,
      assertFn: (d) => {
        const item = d.find((p) => p.product_id === productId);
        stockAfterMomo1 = item?.quantity || 0;
        return stockAfterMomo1 === stockBeforeMomo - 2;
      },
    },
    async () => {
      return await axios.get(`${BASE_URL}/inventory/branch/${branchId}`);
    }
  );

  await testCase(
    'Giai đoạn 2 [2.8a]: Gọi mô phỏng thanh toán online LẦN 2 (Idempotency) -> Trả về 200 và giữ nguyên trạng thái',
    {
      expectedStatus: 200,
      assertFn: (d) => d.success === true && d.status === 'PAID' && d.idempotent === true,
    },
    async () => {
      return await axios.post(`${BASE_URL}/payments/simulate-success`, {
        orderId: orderOnlineId,
        token: onlineToken,
      });
    }
  );

  await testCase(
    'Giai đoạn 2 [2.8b]: Xác nhận tồn kho KHÔNG bị trừ lần 2 sau khi gọi lại simulate-success',
    {
      expectedStatus: 200,
      assertFn: (d) => {
        const item = d.find((p) => p.product_id === productId);
        const stockAfterMomo2 = item?.quantity || 0;
        return stockAfterMomo2 === stockAfterMomo1;
      },
    },
    async () => {
      return await axios.get(`${BASE_URL}/inventory/branch/${branchId}`);
    }
  );

  console.log('\n--- Kiểm thử PAYMENT_SIMULATION=false bằng payment-service cục bộ tắt simulation ---');
  const localPaymentPort = 3095;
  const localPaymentUrl = `http://localhost:${localPaymentPort}`;
  const paymentDistPath = path.join(__dirname, '../apps/payment-service/dist/main.js');
  if (!fs.existsSync(paymentDistPath)) {
    execSync('npm --prefix apps/payment-service run build', { stdio: 'inherit' });
  }

  const localPaymentProc = spawn(
    process.execPath,
    [paymentDistPath],
    {
      env: {
        ...process.env,
        PORT: String(localPaymentPort),
        PAYMENT_SIMULATION: 'false',
        ORDER_SERVICE_URL: process.env.ORDER_SERVICE_URL || 'http://localhost:3004',
      },
      stdio: 'ignore',
    }
  );

  try {
    for (let i = 0; i < 40; i++) {
      try {
        const h = await axios.get(`${localPaymentUrl}/payments/health`, { timeout: 300 });
        if (h.status === 200) break;
      } catch (e) {}
      await sleep(250);
    }

    await testCase(
      'Giai đoạn 2 [2.9a]: POST /payments/simulate-success khi server tắt PAYMENT_SIMULATION=false -> Trả về 404 Not Found',
      {
        expectedStatus: 404,
        assertFn: (d) => d.statusCode === 404,
      },
      async () => {
        return await axios.post(`${localPaymentUrl}/payments/simulate-success`, {
          orderId: orderOnlineId,
          token: onlineToken,
        });
      }
    );

    await testCase(
      'Giai đoạn 2 [2.9b]: GET /payments/simulate-success/:orderId khi server tắt PAYMENT_SIMULATION=false -> Trả về 404 Not Found',
      {
        expectedStatus: 404,
        assertFn: (d) => d.statusCode === 404,
      },
      async () => {
        return await axios.get(
          `${localPaymentUrl}/payments/simulate-success/${orderOnlineId}?token=${onlineToken}`
        );
      }
    );

    await testCase(
      'Giai đoạn 2 [2.9c]: Request gửi cờ bật giả (x-payment-simulation: true) khi server tắt vẫn nhận 404',
      {
        expectedStatus: 404,
        assertFn: (d) => d.statusCode === 404,
      },
      async () => {
        return await axios.post(
          `${localPaymentUrl}/payments/simulate-success`,
          { orderId: orderOnlineId, token: onlineToken, simulate: true },
          { headers: { 'x-payment-simulation': 'true' } }
        );
      }
    );
  } finally {
    if (localPaymentProc) {
      localPaymentProc.kill();
    }
  }

  // ============================================================================
  // NHÓM 8: TÌM KIẾM, LỌC SẢN PHẨM PHÍA SERVER, UPLOAD ẢNH & AN TOÀN HỆ THỐNG
  // ============================================================================
  console.log('\n--- NHÓM 8: TÌM KIẾM, LỌC SẢN PHẨM PHÍA SERVER, UPLOAD ẢNH & AN TOÀN HỆ THỐNG ---');

  const GATEWAY_ROOT = BASE_URL.replace(/\/api\/v1\/?$/, '');
  let uploadedImageUrl = '';
  let uploadedImageFilename = '';

  // 8.1 GET /products - Trả về cấu trúc phân trang chuẩn { items, total, page, limit, totalPages }
  await testCase(
    '8.1 GET /products - Cấu trúc phân trang chuẩn { items, total, page, limit, totalPages }',
    {
      expectedStatus: 200,
      assertFn: (d) =>
        Array.isArray(d.items) &&
        typeof d.total === 'number' &&
        d.page === 1 &&
        d.limit === 5 &&
        typeof d.totalPages === 'number',
    },
    async () => {
      return await axios.get(`${BASE_URL}/products?page=1&limit=5`);
    }
  );

  // 8.2 GET /products?q=... - Tìm kiếm theo tên sản phẩm
  await testCase(
    '8.2 GET /products?q=... - Tìm kiếm sản phẩm theo tên',
    {
      expectedStatus: 200,
      assertFn: (d) =>
        d.items.length > 0 && d.items.some((p) => p.name.includes('Trà Sữa Trân Châu')),
    },
    async () => {
      return await axios.get(`${BASE_URL}/products?q=${encodeURIComponent('Trà Sữa')}`);
    }
  );

  // 8.3 GET /products?q=... - Tìm kiếm theo SKU sản phẩm
  await testCase(
    '8.3 GET /products?q=... - Tìm kiếm sản phẩm theo SKU',
    {
      expectedStatus: 200,
      assertFn: (d) =>
        d.items.length > 0 && d.items.some((p) => p.sku === testProduct.sku),
    },
    async () => {
      return await axios.get(`${BASE_URL}/products?q=${encodeURIComponent(testProduct.sku)}`);
    }
  );

  // 8.4 GET /products?minPrice=...&maxPrice=... - Lọc theo khoảng giá hợp lệ
  await testCase(
    '8.4 GET /products - Lọc theo khoảng giá (minPrice & maxPrice)',
    {
      expectedStatus: 200,
      assertFn: (d) =>
        d.items.length > 0 &&
        d.items.every((p) => Number(p.base_price) >= 30000 && Number(p.base_price) <= 40000),
    },
    async () => {
      return await axios.get(`${BASE_URL}/products?minPrice=30000&maxPrice=40000`);
    }
  );

  // 8.5 GET /products?sort=price_asc - Sắp xếp theo giá tăng dần
  await testCase(
    '8.5 GET /products?sort=price_asc - Sắp xếp theo giá tăng dần',
    {
      expectedStatus: 200,
      assertFn: (d) => {
        if (d.items.length <= 1) return true;
        for (let i = 1; i < d.items.length; i++) {
          if (Number(d.items[i].base_price) < Number(d.items[i - 1].base_price)) return false;
        }
        return true;
      },
    },
    async () => {
      return await axios.get(`${BASE_URL}/products?sort=price_asc&limit=10`);
    }
  );

  // 8.6 GET /products?sort=price_desc - Sắp xếp theo giá giảm dần
  await testCase(
    '8.6 GET /products?sort=price_desc - Sắp xếp theo giá giảm dần',
    {
      expectedStatus: 200,
      assertFn: (d) => {
        if (d.items.length <= 1) return true;
        for (let i = 1; i < d.items.length; i++) {
          if (Number(d.items[i].base_price) > Number(d.items[i - 1].base_price)) return false;
        }
        return true;
      },
    },
    async () => {
      return await axios.get(`${BASE_URL}/products?sort=price_desc&limit=10`);
    }
  );

  // 8.7 GET /products?sort=name - Sắp xếp theo tên sản phẩm
  await testCase(
    '8.7 GET /products?sort=name - Sắp xếp theo tên sản phẩm (A-Z)',
    {
      expectedStatus: 200,
      assertFn: (d) => {
        if (d.items.length <= 1) return true;
        for (let i = 1; i < d.items.length; i++) {
          if (d.items[i].name.localeCompare(d.items[i - 1].name) < 0) return false;
        }
        return true;
      },
    },
    async () => {
      return await axios.get(`${BASE_URL}/products?sort=name&limit=10`);
    }
  );

  // 8.8 GET /products?minPrice=-100 - minPrice âm -> Từ chối 400 Bad Request
  await testCase(
    '8.8 GET /products?minPrice=-100 - minPrice âm -> Từ chối 400 Bad Request',
    {
      expectedStatus: 400,
      assertFn: (d) => d.statusCode === 400,
    },
    async () => {
      return await axios.get(`${BASE_URL}/products?minPrice=-100`);
    }
  );

  // 8.9 GET /products?minPrice=50000&maxPrice=10000 - minPrice > maxPrice -> Từ chối 400 Bad Request
  await testCase(
    '8.9 GET /products - minPrice > maxPrice vô lý -> Từ chối 400 Bad Request',
    {
      expectedStatus: 400,
      assertFn: (d) => d.statusCode === 400,
    },
    async () => {
      return await axios.get(`${BASE_URL}/products?minPrice=50000&maxPrice=10000`);
    }
  );

  // 8.10 GET /products?sort=invalid_sort - sort sai giá trị -> Từ chối 400 Bad Request
  await testCase(
    '8.10 GET /products?sort=invalid_sort - sort không hợp lệ -> Từ chối 400 Bad Request',
    {
      expectedStatus: 400,
      assertFn: (d) => d.statusCode === 400,
    },
    async () => {
      return await axios.get(`${BASE_URL}/products?sort=invalid_sort`);
    }
  );

  // 8.11 GET /products?page=0 - page < 1 -> Từ chối 400 Bad Request
  await testCase(
    '8.11 GET /products?page=0 - page nhỏ hơn 1 -> Từ chối 400 Bad Request',
    {
      expectedStatus: 400,
      assertFn: (d) => d.statusCode === 400,
    },
    async () => {
      return await axios.get(`${BASE_URL}/products?page=0`);
    }
  );

  // 8.12 GET /products?limit=-5 - limit < 1 -> Từ chối 400 Bad Request
  await testCase(
    '8.12 GET /products?limit=-5 - limit nhỏ hơn 1 -> Từ chối 400 Bad Request',
    {
      expectedStatus: 400,
      assertFn: (d) => d.statusCode === 400,
    },
    async () => {
      return await axios.get(`${BASE_URL}/products?limit=-5`);
    }
  );

  // 8.13 POST /products/:id/image không gửi token -> Từ chối 401 Unauthorized
  await testCase(
    '8.13 POST /products/:id/image không gửi token -> Từ chối 401 Unauthorized',
    {
      expectedStatus: 401,
      assertFn: (d) => d.statusCode === 401,
    },
    async () => {
      const fd = new FormData();
      fd.append('image', new Blob([Buffer.from('png-data')], { type: 'image/png' }), 'test.png');
      return await axios.post(`${BASE_URL}/products/${productId}/image`, fd);
    }
  );

  // 8.14 POST /products/:id/image với token CUSTOMER -> Bị từ chối 403 Forbidden
  await testCase(
    '8.14 POST /products/:id/image bằng token CUSTOMER -> Bị từ chối 403 Forbidden',
    {
      expectedStatus: 403,
      assertFn: (d) => d.statusCode === 403,
    },
    async () => {
      const fd = new FormData();
      fd.append('image', new Blob([Buffer.from('png-data')], { type: 'image/png' }), 'test.png');
      return await axios.post(`${BASE_URL}/products/${productId}/image`, fd, {
        headers: { Authorization: `Bearer ${customerAccessToken}` },
      });
    }
  );

  // 8.15 POST /products/:id/image với token BRANCH_MANAGER -> Bị từ chối 403 Forbidden
  await testCase(
    '8.15 POST /products/:id/image bằng token BRANCH_MANAGER -> Bị từ chối 403 Forbidden',
    {
      expectedStatus: 403,
      assertFn: (d) => d.statusCode === 403,
    },
    async () => {
      const fd = new FormData();
      fd.append('image', new Blob([Buffer.from('png-data')], { type: 'image/png' }), 'test.png');
      return await axios.post(`${BASE_URL}/products/${productId}/image`, fd, {
        headers: { Authorization: `Bearer ${managerAccessToken}` },
      });
    }
  );

  // 8.16 POST /products/:id/image với file sai định dạng (.exe) -> Từ chối 400 Bad Request
  await testCase(
    '8.16 POST /products/:id/image với tệp sai định dạng (.exe) -> Từ chối 400 Bad Request',
    {
      expectedStatus: 400,
      assertFn: (d) => d.statusCode === 400,
    },
    async () => {
      const fd = new FormData();
      fd.append('image', new Blob([Buffer.from('malicious-exe')], { type: 'application/octet-stream' }), 'trojan.exe');
      return await axios.post(`${BASE_URL}/products/${productId}/image`, fd, {
        headers: { Authorization: `Bearer ${adminAccessToken}` },
      });
    }
  );

  // 8.17 POST /products/:id/image với file dung lượng vượt quá 2MB -> Từ chối 400 Bad Request
  await testCase(
    '8.17 POST /products/:id/image với file dung lượng quá 2MB -> Từ chối 400 Bad Request',
    {
      expectedStatus: 400,
      assertFn: (d) => d.statusCode === 400,
    },
    async () => {
      const fd = new FormData();
      const largeBytes = Buffer.alloc(2.5 * 1024 * 1024);
      fd.append('image', new Blob([largeBytes], { type: 'image/jpeg' }), 'large.jpg');
      return await axios.post(`${BASE_URL}/products/${productId}/image`, fd, {
        headers: { Authorization: `Bearer ${adminAccessToken}` },
      });
    }
  );

  // 8.18 POST /products/:id/image với file PNG hợp lệ (< 2MB) bằng ADMIN -> Thành công 201/200
  await testCase(
    '8.18 POST /products/:id/image bằng ADMIN với ảnh PNG hợp lệ (< 2MB) -> Thành công, trả image_url',
    {
      expectedStatus: [200, 201],
      assertFn: (d) => {
        if (!d.image_url || !d.image_url.startsWith('/uploads/')) return false;
        uploadedImageUrl = d.image_url;
        uploadedImageFilename = path.basename(d.image_url);
        return true;
      },
    },
    async () => {
      const fd = new FormData();
      const samplePng = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
        0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
        0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
        0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
        0x42, 0x60, 0x82,
      ]);
      fd.append('image', new Blob([samplePng], { type: 'image/png' }), 'sample-product.png');
      return await axios.post(`${BASE_URL}/products/${productId}/image`, fd, {
        headers: { Authorization: `Bearer ${adminAccessToken}` },
      });
    }
  );

  // 8.19 GET /products/:id -> Cột image_url đã được cập nhật đường dẫn tương đối trong DB
  await testCase(
    '8.19 GET /products/:id - Xác nhận image_url đã cập nhật đường dẫn tương đối trong DB',
    {
      expectedStatus: 200,
      assertFn: (d) => d.image_url === uploadedImageUrl,
    },
    async () => {
      return await axios.get(`${BASE_URL}/products/${productId}`);
    }
  );

  // 8.20 GET ảnh vừa upload qua Gateway (GET /uploads/:filename) -> Phục vụ ảnh công khai HTTP 200 OK
  await testCase(
    '8.20 GET ảnh trực tiếp qua Gateway (GET /uploads/:filename) -> Phục vụ công khai 200 OK',
    {
      expectedStatus: 200,
      assertFn: () => true,
    },
    async () => {
      return await axios.get(`${GATEWAY_ROOT}${uploadedImageUrl}`);
    }
  );

  // 8.21 GET ảnh qua Gateway với tiền tố api/v1 (GET /api/v1/uploads/:filename) -> Phục vụ ảnh công khai HTTP 200 OK
  await testCase(
    '8.21 GET ảnh qua tiền tố api/v1 (GET /api/v1/uploads/:filename) -> Phục vụ công khai 200 OK',
    {
      expectedStatus: 200,
      assertFn: () => true,
    },
    async () => {
      return await axios.get(`${BASE_URL}${uploadedImageUrl}`);
    }
  );

  // 8.22 Chống Path Traversal: GET /uploads/../../etc/passwd -> Bị chặn 400 Bad Request
  await testCase(
    '8.22 Tấn công Path Traversal: GET /uploads/..%2F..%2Fetc%2Fpasswd -> Bị chặn 400 Bad Request',
    {
      expectedStatus: 400,
      assertFn: (d) => d.statusCode === 400,
    },
    async () => {
      return await axios.get(`${GATEWAY_ROOT}/uploads/..%2F..%2Fetc%2Fpasswd`);
    }
  );

  // 8.23 Chống Path Traversal: GET /uploads/%2e%2e/uploads -> Bị chặn 400 Bad Request
  await testCase(
    '8.23 Tấn công Path Traversal: GET /uploads/%2e%2e/uploads -> Bị chặn 400 Bad Request',
    {
      expectedStatus: 400,
      assertFn: (d) => d.statusCode === 400,
    },
    async () => {
      return await axios.get(`${GATEWAY_ROOT}/uploads/%2e%2e/uploads`);
    }
  );

  // 8.24 GET ảnh không tồn tại (GET /uploads/non-existent-img.png) -> Trả về 404 Not Found
  await testCase(
    '8.24 GET ảnh không tồn tại (GET /uploads/non-existent-img.png) -> Trả về 404 Not Found',
    {
      expectedStatus: 404,
      assertFn: (d) => d.statusCode === 404,
    },
    async () => {
      return await axios.get(`${GATEWAY_ROOT}/uploads/non-existent-img-12345.png`);
    }
  );

  // ============================================================================
  // YÊU CẦU DỌN DẸP TOÀN BỘ DỮ LIỆU TEST KHI BẬT --cleanup
  // ============================================================================
  if (shouldCleanup) {
    console.log('\n======================================================');
    console.log('🧹 BẮT ĐẦU DỌN DẸP TOÀN DIỆN DỮ LIỆU KIỂM THỬ (--cleanup)...');
    console.log('======================================================');

    async function createDbConn(dbUrl) {
      if (!dbUrl) return null;
      const isSsl = dbUrl.includes('ssl-mode=REQUIRED') || dbUrl.includes('aivencloud.com');
      return await mysql.createConnection({
        uri: dbUrl,
        ...(isSsl ? { ssl: { rejectUnauthorized: false } } : {}),
      });
    }

    const authDbUrl = process.env.TEST_AUTH_DB_URL || process.env.AUTH_DB_URL || 'mysql://root:rootpassword@localhost:3306/csm_auth';
    if (authDbUrl) {
      try {
        const authConn = await createDbConn(authDbUrl);
        const [delUsers] = await authConn.execute(
          "DELETE FROM users WHERE email LIKE 'test_%@csm.vn' OR email IN (?, ?)",
          [testCustomerEmail, unspecifiedRoleEmail]
        );
        console.log(`   ✨ Đã dọn dẹp ${delUsers.affectedRows} tài khoản test trong Auth DB`);
        await authConn.end();
      } catch (err) {
        console.warn(`   ⚠️ Không thể dọn dẹp Auth DB: ${err.message}`);
      }
    }

    const orderDbUrl = process.env.TEST_ORDER_DB_URL || process.env.ORDER_DB_URL || 'mysql://root:rootpassword@localhost:3306/csm_order';
    if (orderDbUrl) {
      try {
        const orderConn = await createDbConn(orderDbUrl);
        const orderIds = [order1Id, order2Id, orderOnlineId, orderCodId, csmOrderCodId, orderBr02Id, managerUpdateOrderId].filter(Boolean);
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

    const invDbUrl = process.env.TEST_INVENTORY_DB_URL || process.env.INVENTORY_DB_URL || 'mysql://root:rootpassword@localhost:3306/csm_inventory';
    if (invDbUrl) {
      try {
        const invConn = await createDbConn(invDbUrl);
        const orderIds = [order1Id, order2Id, orderOnlineId, orderCodId, csmOrderCodId, orderBr02Id, managerUpdateOrderId].filter(Boolean);
        if (orderIds.length > 0) {
          const placeholders = orderIds.map(() => '?').join(',');
          await invConn.execute(
            `DELETE FROM stock_transactions WHERE reference_id IN (${placeholders}) OR reference_id LIKE 'sim-db-fail-%' OR reference_id LIKE 'race-%' OR reference_id LIKE 'concurrency-%'`,
            orderIds
          );
        }
        if (productId) {
          const [delStocks] = await invConn.execute('DELETE FROM stocks WHERE product_id = ?', [productId]);
          console.log(`   ✨ Đã hoàn trả & dọn dẹp ${delStocks.affectedRows} bản ghi tồn kho kiểm thử`);
        }
        if (testBranchId) {
          await invConn.execute('DELETE FROM branches WHERE id = ? OR id LIKE "br-test-%"', [testBranchId]);
          console.log(`   ✨ Đã dọn dẹp chi nhánh kiểm thử ${testBranchId} trong Inventory DB`);
        }
        await invConn.end();
      } catch (err) {
        console.warn(`   ⚠️ Không thể dọn dẹp Inventory DB: ${err.message}`);
      }
    }

    const prodDbUrl = process.env.TEST_PRODUCT_DB_URL || process.env.PRODUCT_DB_URL || 'mysql://root:rootpassword@localhost:3306/csm_product';
    if (prodDbUrl) {
      try {
        const prodConn = await createDbConn(prodDbUrl);
        if (productId) {
          const [delProd] = await prodConn.execute(
            "DELETE FROM products WHERE id = ? OR sku LIKE 'SKU-E2E-%'",
            [productId]
          );
          console.log(`   ✨ Đã dọn dẹp ${delProd.affectedRows} sản phẩm kiểm thử trong Product DB`);
        }
                if (uploadedImageFilename) {
          const uploadDir = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads');
          const testImgPath = path.join(uploadDir, uploadedImageFilename);
          if (fs.existsSync(testImgPath)) {
            try {
              fs.unlinkSync(testImgPath);
              console.log(`   ✨ Đã dọn dẹp file ảnh kiểm thử: ${uploadedImageFilename}`);
            } catch (e) {}
          }
        }
        await prodConn.end();
      } catch (err) {
        console.warn(`   ⚠️ Không thể dọn dẹp Product DB: ${err.message}`);
      }
    }

    console.log('✅ Hoàn tất dọn dẹp toàn bộ dữ liệu kiểm thử, đưa hệ thống về trạng thái sạch!\n');
  }

  // ============================================================================
  // TỔNG KẾT & IN DANH SÁCH CHI TIẾT TÊN CÁC CA KIỂM THỬ ĐỐI CHIẾU
  // ============================================================================
  const totalTests = passedCount + failedCount;
  console.log('\n======================================================');
  console.log(`📊 TỔNG KẾT KIỂM THỬ: ${passedCount}/${totalTests} ca đạt (Khôi phục toàn diện & không xoá ca cũ)`);
  console.log('======================================================\n');

  console.log('📋 DANH SÁCH CHI TIẾT TẤT CẢ CÁC CA KIỂM THỬ ĐÃ THỰC THI:');
  results.forEach((r, idx) => {
    const statusTag = r.passed ? '✅ [PASS]' : '❌ [FAIL]';
    console.log(`  ${String(idx + 1).padStart(2, '0')}. ${statusTag} [${r.status}] ${r.name}`);
  });
  console.log(`\nTổng số ca kiểm thử đã thực thi: ${totalTests} ca\n`);

  if (failedCount > 0) {
    console.error(`❌ Phát hiện ${failedCount} ca thất bại. Thoát với mã lỗi 1.`);
    process.exit(1);
  } else {
    console.log(`🎉 Tất cả ${passedCount}/${totalTests} ca kiểm thử đều hoàn thành xuất sắc (PASS)!`);
    process.exit(0);
  }
}

runSuite().catch((err) => {
  console.error('Lỗi thực thi test suite:', err);
  process.exit(1);
});
