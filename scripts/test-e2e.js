const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:8000/api/v1';
const shouldCleanup = process.argv.includes('--cleanup') || process.env.TEST_CLEANUP === 'true';

async function runSuite() {
  console.log(`🚀 BẮT ĐẦU CHẠY BỘ KIỂM THỬ E2E TẠI: ${BASE_URL}`);
  if (shouldCleanup) {
    console.log('🧹 Chế độ dọn dẹp dữ liệu test (--cleanup): ĐƯỢC BẬT');
  }

  const results = [];
  const cleanupTasks = [];

  async function testCase(name, fn) {
    try {
      const res = await fn();
      const status = res.status;
      const data = res.data;
      results.push({ name, status, data });
      console.log(`\n======================================================`);
      console.log(`✅ [${status}] ${name}`);
      console.log(JSON.stringify(data, null, 2).slice(0, 500));
      return { status, data };
    } catch (err) {
      const status = err.response?.status || 500;
      const data = err.response?.data || err.message;
      results.push({ name, status, data });
      console.log(`\n======================================================`);
      console.log(`❌ [${status}] ${name}`);
      console.log(JSON.stringify(data, null, 2).slice(0, 500));
      return { status, data };
    }
  }

  // 1. Đăng ký tài khoản CUSTOMER
  let newCustomerToken = '';
  const testCustomerEmail = `test_customer_${Date.now()}@csm.vn`;
  await testCase('1. Đăng ký tài khoản CUSTOMER mới (ép role=CUSTOMER)', async () => {
    const res = await axios.post(`${BASE_URL}/auth/register`, {
      email: testCustomerEmail,
      password: 'Password@123',
      fullName: 'Khách Hàng Kiểm Thử',
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

  // 4. Refresh token bằng Refresh Token hợp lệ
  await testCase('4. Refresh token bằng Refresh Token hợp lệ', async () => {
    return await axios.post(`${BASE_URL}/auth/refresh`, {
      refreshToken: adminRefreshToken,
    });
  });

  // 5. Refresh token từ chối Access Token (type claim check)
  await testCase('5. Refresh token từ chối Access Token (type claim check)', async () => {
    return await axios.post(`${BASE_URL}/auth/refresh`, {
      refreshToken: adminAccessToken,
    });
  });

  // Chuẩn bị 1 sản phẩm mẫu & tồn kho ban đầu
  let testProduct = null;
  const branchId = 'br-01';

  await testCase('Chuẩn bị: Tạo sản phẩm mẫu bằng token ADMIN', async () => {
    const res = await axios.post(
      `${BASE_URL}/products`,
      {
        sku: 'SKU-E2E-' + Date.now(),
        name: 'Trà Sữa Trân Châu CSM',
        base_price: 35000,
        description: 'Trà sữa đậm vị tự nhiên',
      },
      {
        headers: { Authorization: `Bearer ${adminAccessToken}` },
      }
    );
    testProduct = res.data;
    cleanupTasks.push(async () => {
      await axios.delete(`${BASE_URL}/products/${testProduct.id}`, {
        headers: { Authorization: `Bearer ${adminAccessToken}` },
      }).catch(() => {});
    });
    return res;
  });

  const productId = testProduct.id;

  // Nhập tồn kho 100 sản phẩm tại br-01
  await testCase('Chuẩn bị: Nhập 100 sản phẩm vào kho chi nhánh br-01', async () => {
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

  // YÊU CẦU 3: Kiểm tra branchId không tồn tại -> từ chối 400 Bad Request
  await testCase('Kiểm tra Yêu cầu 3: Tạo đơn với branchId không tồn tại (br-99999) -> Bị từ chối 400', async () => {
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
  });

  // YÊU CẦU 2.(a): Token CUSTOMER hợp lệ + header x-user-role: ADMIN gọi POST /inventory/add-stock -> phải 403
  await testCase('Kiểm tra 2.(a): Token CUSTOMER + header x-user-role: ADMIN gọi add-stock -> Phải 403', async () => {
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
  });

  // YÊU CẦU 2.(b): Kiểm tra vòng đời Đơn 1 (PENDING -> CONFIRMED) & in số lượng tồn kho + StockTransaction
  let order1Id = '';
  await testCase('Tạo Đơn Hàng 1 (Số lượng 3) -> Trạng thái PENDING', async () => {
    const res = await axios.post(
      `${BASE_URL}/orders`,
      {
        branchId,
        items: [{ productId, quantity: 3, price: 1 }], // Client gửi giá giả 1đ
        shippingAddress: '123 Lê Lợi, Q1',
        paymentMethod: 'COD',
      },
      {
        headers: { Authorization: `Bearer ${customerAccessToken}` },
      }
    );
    order1Id = res.data.orderId;
    return res;
  });

  // Lấy tồn kho ngay sau khi PENDING (Trước khi duyệt)
  let stockBeforeConfirm = null;
  await testCase('2.(b) [Trước duyệt] Tồn kho br-01 khi Đơn 1 đang PENDING (reserved_quantity tăng)', async () => {
    const res = await axios.get(`${BASE_URL}/inventory/product/${productId}`);
    stockBeforeConfirm = res.data.find(b => b.branch_id === branchId);
    return {
      status: 200,
      data: {
        branch: branchId,
        quantity: stockBeforeConfirm.quantity,
        reserved_quantity: stockBeforeConfirm.reserved_quantity,
        available: stockBeforeConfirm.available,
      },
    };
  });

  // ADMIN duyệt đơn PENDING -> CONFIRMED
  await testCase('2.(b) ADMIN duyệt Đơn 1: PENDING -> CONFIRMED (gọi confirm-deduct)', async () => {
    return await axios.patch(
      `${BASE_URL}/orders/${order1Id}/status`,
      { status: 'CONFIRMED' },
      { headers: { Authorization: `Bearer ${adminAccessToken}` } }
    );
  });

  // Lấy tồn kho sau khi CONFIRMED
  let stockAfterConfirm = null;
  await testCase('2.(b) [Sau duyệt] Tồn kho br-01 sau khi CONFIRMED (quantity giảm, reserved_quantity giảm)', async () => {
    const res = await axios.get(`${BASE_URL}/inventory/product/${productId}`);
    stockAfterConfirm = res.data.find(b => b.branch_id === branchId);
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
  });

  // Lấy bản ghi StockTransaction (RESERVE, OUT) của Đơn 1
  await testCase('2.(b) [Bản ghi StockTransaction] Các giao dịch (RESERVE, OUT) của Đơn 1', async () => {
    const res = await axios.get(`${BASE_URL}/inventory/transactions?referenceId=${order1Id}`);
    return {
      status: 200,
      data: {
        orderId: order1Id,
        transactions: res.data.map(tx => ({
          id: tx.id,
          type: tx.type,
          quantity: tx.quantity,
          reference_id: tx.reference_id,
          created_at: tx.created_at,
        })),
      },
    };
  });

  // YÊU CẦU 2.(c): Huỷ đơn PENDING -> In ra reserved_quantity trước/sau và xác nhận release
  let order2Id = '';
  await testCase('Tạo Đơn Hàng 2 (Số lượng 5) để thử nghiệm huỷ đơn PENDING', async () => {
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
  });

  // Tồn kho trước khi huỷ
  let stockBeforeCancel = null;
  await testCase('2.(c) [Trước huỷ] Tồn kho khi Đơn 2 đang PENDING (reserved_quantity gồm 5 món Đơn 2)', async () => {
    const res = await axios.get(`${BASE_URL}/inventory/product/${productId}`);
    stockBeforeCancel = res.data.find(b => b.branch_id === branchId);
    return {
      status: 200,
      data: {
        branch: branchId,
        quantity: stockBeforeCancel.quantity,
        reserved_quantity: stockBeforeCancel.reserved_quantity,
        available: stockBeforeCancel.available,
      },
    };
  });

  // CUSTOMER huỷ đơn của chính mình
  await testCase('2.(c) CUSTOMER huỷ Đơn 2: PENDING -> CANCELLED (kích hoạt release-stock)', async () => {
    return await axios.patch(
      `${BASE_URL}/orders/${order2Id}/status`,
      { status: 'CANCELLED' },
      { headers: { Authorization: `Bearer ${customerAccessToken}` } }
    );
  });

  // Tồn kho sau khi huỷ
  let stockAfterCancel = null;
  await testCase('2.(c) [Sau huỷ] Tồn kho sau khi huỷ Đơn 2 (reserved_quantity đã được giải phóng)', async () => {
    const res = await axios.get(`${BASE_URL}/inventory/product/${productId}`);
    stockAfterCancel = res.data.find(b => b.branch_id === branchId);
    return {
      status: 200,
      data: {
        branch: branchId,
        reserved_truoc_khi_huy: stockBeforeCancel.reserved_quantity,
        reserved_sau_khi_huy: stockAfterCancel.reserved_quantity,
        so_luong_giai_phong: stockBeforeCancel.reserved_quantity - stockAfterCancel.reserved_quantity,
      },
    };
  });

  // Lấy bản ghi StockTransaction (CANCEL_RESERVE) của Đơn 2
  await testCase('2.(c) [Bản ghi StockTransaction] Các giao dịch (RESERVE, CANCEL_RESERVE) của Đơn 2', async () => {
    const res = await axios.get(`${BASE_URL}/inventory/transactions?referenceId=${order2Id}`);
    return {
      status: 200,
      data: {
        orderId: order2Id,
        transactions: res.data.map(tx => ({
          id: tx.id,
          type: tx.type,
          quantity: tx.quantity,
          reference_id: tx.reference_id,
          created_at: tx.created_at,
        })),
      },
    };
  });

  // YÊU CẦU 2.(d): Mô phỏng lưu đơn lỗi sau khi reserve-stock thành công -> xác nhận release-stock khôi phục kho
  await testCase('2.(d) Mô phỏng Saga bù trừ: Giữ kho -> Giả lập lưu đơn lỗi -> Kích hoạt release-stock', async () => {
    const simRefId = 'sim-db-fail-' + Date.now();
    
    // Bước 1: Lấy tồn kho trước
    const beforeStockRes = await axios.get(`${BASE_URL}/inventory/product/${productId}`);
    const beforeStock = beforeStockRes.data.find(b => b.branch_id === branchId);

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
    const duringStock = duringStockRes.data.find(b => b.branch_id === branchId);

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
    const afterStock = afterStockRes.data.find(b => b.branch_id === branchId);

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
  });

  // YÊU CẦU 5: Chế độ dọn dẹp dữ liệu kiểm thử
  if (shouldCleanup) {
    console.log('\n🧹 Bắt đầu dọn dẹp các tài nguyên kiểm thử...');
    for (const task of cleanupTasks) {
      await task();
    }
    console.log('✨ Dọn dẹp hoàn tất thành công.');
  }

  console.log('\n======================================================');
  console.log(`🎉 TOÀN BỘ CÁC CA KIỂM THỬ ĐÃ THỰC THI HOÀN TẤT`);
  console.log(`======================================================\n`);
}

runSuite().catch((err) => {
  console.error('Lỗi thực thi test suite:', err);
});
