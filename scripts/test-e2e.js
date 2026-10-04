const axios = require('axios');

const BASE_URL = 'http://localhost:8000/api/v1';

async function runTests() {
  const results = [];

  async function testCase(name, fn) {
    try {
      const res = await fn();
      const summary = {
        name,
        status: res.status,
        data: res.data,
      };
      results.push(summary);
      console.log(`\n=== [${summary.status}] ${name} ===`);
      console.log(JSON.stringify(summary.data, null, 2).slice(0, 300));
    } catch (err) {
      const status = err.response?.status || 500;
      const data = err.response?.data || err.message;
      const summary = {
        name,
        status,
        data,
      };
      results.push(summary);
      console.log(`\n=== [${status}] ${name} ===`);
      console.log(JSON.stringify(data, null, 2).slice(0, 300));
    }
  }

  // 1. Đăng ký tài khoản CUSTOMER mới
  let newCustomerToken = '';
  await testCase('1. Đăng ký tài khoản CUSTOMER mới', async () => {
    const res = await axios.post(`${BASE_URL}/auth/register`, {
      email: `customer_${Date.now()}@csm.vn`,
      password: 'Password@123',
      fullName: 'Khách Hàng Thật',
      role: 'ADMIN', // Thử hack role -> server phải ép về CUSTOMER
      branch_id: 'br-01',
    });
    newCustomerToken = res.data.accessToken;
    return res;
  });

  // 2. Đăng nhập ADMIN
  let adminAccessToken = '';
  let adminRefreshToken = '';
  await testCase('2. Đăng nhập ADMIN (seed account)', async () => {
    const res = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'admin@csm.vn',
      password: 'Admin@123456',
    });
    adminAccessToken = res.data.accessToken;
    adminRefreshToken = res.data.refreshToken;
    return res;
  });

  // 3. Đăng nhập CUSTOMER seed
  let customerAccessToken = '';
  await testCase('3. Đăng nhập CUSTOMER (seed account)', async () => {
    const res = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'customer@csm.vn',
      password: 'Customer@123456',
    });
    customerAccessToken = res.data.accessToken;
    return res;
  });

  // 4. Đăng nhập BRANCH_MANAGER seed
  let managerAccessToken = '';
  await testCase('4. Đăng nhập BRANCH_MANAGER (seed account)', async () => {
    const res = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'manager.q1@csm.vn',
      password: 'Manager@123456',
    });
    managerAccessToken = res.data.accessToken;
    return res;
  });

  // 5. Refresh token hợp lệ
  await testCase('5. Refresh token bằng Refresh Token hợp lệ', async () => {
    return await axios.post(`${BASE_URL}/auth/refresh`, {
      refreshToken: adminRefreshToken,
    });
  });

  // 6. Refresh token từ chối Access Token (type claim check)
  await testCase('6. Refresh token từ chối Access Token (bảo mật type claim)', async () => {
    return await axios.post(`${BASE_URL}/auth/refresh`, {
      refreshToken: adminAccessToken,
    });
  });

  // Tạo 1 sản phẩm mẫu bằng token ADMIN
  let realProduct = null;
  await testCase('Tạo sản phẩm mẫu bằng token ADMIN', async () => {
    const res = await axios.post(
      `${BASE_URL}/products`,
      {
        sku: 'SKU-COFFEE-' + Date.now(),
        name: 'Cà Phê Muối Sữa CSM',
        base_price: 29000,
        description: 'Cà phê nguyên chất pha phin',
      },
      {
        headers: { Authorization: `Bearer ${adminAccessToken}` },
      }
    );
    realProduct = res.data;
    return res;
  });

  const productId = realProduct ? realProduct.id : 'p1';
  const branchId = 'br-01';

  // Nhập tồn kho 100 hộp cho sản phẩm này tại br-01 bằng token ADMIN
  await testCase('Nhập kho 100 sản phẩm tại br-01 bằng token ADMIN', async () => {
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
  });

  // 7. (d) Tạo đơn với giá giả từ client (1 VNĐ) -> verify server tự lấy base_price (29,000)
  let createdOrderId = '';
  await testCase('7. (d) Client gửi giá GIẢ (1đ) -> Server tự tính total_amount = 29000đ', async () => {
    const res = await axios.post(
      `${BASE_URL}/orders`,
      {
        branchId,
        items: [
          {
            productId,
            productName: 'Tên Hacker Đặt 1đ',
            price: 1, // Hack giá 1đ
            quantity: 1,
          },
        ],
        shippingAddress: '123 Test Street, TP.HCM',
        paymentMethod: 'COD',
      },
      {
        headers: { Authorization: `Bearer ${customerAccessToken}` },
      }
    );
    createdOrderId = res.data.orderId;
    return res;
  });

  // Kiểm tra chi tiết đơn hàng vừa tạo để xem total_amount thực tế được lưu trong DB
  if (createdOrderId) {
    await testCase('7.1 Xác nhận đơn hàng lưu total_amount chuẩn server (không bị hack)', async () => {
      return await axios.get(`${BASE_URL}/orders/${createdOrderId}`, {
        headers: { Authorization: `Bearer ${customerAccessToken}` },
      });
    });
  }

  // 8. Đặt hàng khi hết kho / vượt tồn kho (số lượng cực lớn)
  await testCase('8. Đặt hàng khi vượt quá tồn kho khả dụng (400 Bad Request)', async () => {
    return await axios.post(
      `${BASE_URL}/orders`,
      {
        branchId,
        items: [
          {
            productId,
            quantity: 999999,
          },
        ],
        shippingAddress: '123 Test Street',
        paymentMethod: 'COD',
      },
      {
        headers: { Authorization: `Bearer ${customerAccessToken}` },
      }
    );
  });

  // 9. (c) 2 request reserve-stock đồng thời cùng referenceId chỉ trừ một lần
  await testCase('9. (c) Idempotency: 2 request reserve-stock đồng thời cùng referenceId', async () => {
    const dupRefId = 'race-order-' + Date.now();
    const req1 = axios.post(
      `${BASE_URL}/inventory/reserve-stock`,
      {
        branchId,
        referenceId: dupRefId,
        items: [{ productId, quantity: 2 }],
      },
      {
        headers: { Authorization: `Bearer ${adminAccessToken}` },
      }
    );
    const req2 = axios.post(
      `${BASE_URL}/inventory/reserve-stock`,
      {
        branchId,
        referenceId: dupRefId,
        items: [{ productId, quantity: 2 }],
      },
      {
        headers: { Authorization: `Bearer ${adminAccessToken}` },
      }
    );
    const [res1, res2] = await Promise.all([req1, req2]);
    return {
      status: 200,
      data: {
        request_1: res1.data,
        request_2: res2.data,
      },
    };
  });

  // 10. (a) CUSTOMER gọi PATCH status=PAID bị 403 Forbidden
  if (createdOrderId) {
    await testCase('10. (a) CUSTOMER gọi PATCH status=PAID bị từ chối 403 Forbidden', async () => {
      return await axios.patch(
        `${BASE_URL}/orders/${createdOrderId}/status`,
        { status: 'PAID' },
        { headers: { Authorization: `Bearer ${customerAccessToken}` } }
      );
    });

    // 10.1 Chuyển trạng thái sai quy tắc (PENDING -> SHIPPED không qua CONFIRMED) -> 400 Bad Request
    await testCase('10.1 Chuyển trạng thái sai quy tắc PENDING -> SHIPPED (400 Bad Request)', async () => {
      return await axios.patch(
        `${BASE_URL}/orders/${createdOrderId}/status`,
        { status: 'SHIPPED' },
        { headers: { Authorization: `Bearer ${adminAccessToken}` } }
      );
    });

    // 10.2 ADMIN chuyển PENDING -> CONFIRMED (thành công 200, kích hoạt confirm-deduct)
    await testCase('10.2 ADMIN duyệt đơn PENDING -> CONFIRMED (200 OK + confirm-deduct)', async () => {
      return await axios.patch(
        `${BASE_URL}/orders/${createdOrderId}/status`,
        { status: 'CONFIRMED' },
        { headers: { Authorization: `Bearer ${adminAccessToken}` } }
      );
    });

    // 10.3 CUSTOMER huỷ đơn đã CONFIRMED -> 403 Forbidden (chỉ huỷ được đơn PENDING)
    await testCase('10.3 CUSTOMER cố huỷ đơn khi đã CONFIRMED -> bị từ chối 403 Forbidden', async () => {
      return await axios.patch(
        `${BASE_URL}/orders/${createdOrderId}/status`,
        { status: 'CANCELLED' },
        { headers: { Authorization: `Bearer ${customerAccessToken}` } }
      );
    });
  }

  // 11. (b) Client gửi header x-user-role: ADMIN không đổi được quyền (Bị Gateway strip)
  await testCase('11. (b) Client gửi giả mạo header x-user-role: ADMIN không có token (401)', async () => {
    return await axios.post(
      `${BASE_URL}/inventory/add-stock`,
      {
        branchId: 'br-01',
        productId,
        quantity: 10,
      },
      {
        headers: {
          'x-user-role': 'ADMIN',
          'x-user-id': 'hacked-id',
        },
      }
    );
  });

  // 12. Token CUSTOMER gọi add-stock bị 403 Forbidden
  await testCase('12. Token CUSTOMER gọi POST /inventory/add-stock bị từ chối 403 Forbidden', async () => {
    return await axios.post(
      `${BASE_URL}/inventory/add-stock`,
      {
        branchId: 'br-01',
        productId,
        quantity: 10,
      },
      {
        headers: { Authorization: `Bearer ${customerAccessToken}` },
      }
    );
  });

  // 13. Token BRANCH_MANAGER nhập kho cho chi nhánh khác chi nhánh quản lý (br-99 != br-01) -> 403
  await testCase('13. BRANCH_MANAGER nhập kho khác chi nhánh quản lý bị từ chối 403 Forbidden', async () => {
    return await axios.post(
      `${BASE_URL}/inventory/add-stock`,
      {
        branchId: 'br-99-diff',
        productId,
        quantity: 10,
      },
      {
        headers: { Authorization: `Bearer ${managerAccessToken}` },
      }
    );
  });

  console.log('\n================ ALL TESTS EXECUTED ================');
}

runTests();
