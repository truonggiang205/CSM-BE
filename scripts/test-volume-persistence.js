const axios = require('axios');
const crypto = require('crypto');
const { execSync } = require('child_process');

async function testPersistence() {
  console.log('======================================================');
  console.log('🧪 KIỂM CHỨNG TÍNH BẢO TOÀN DỮ LIỆU CỦA DOCKER VOLUME');
  console.log('   (DOCKER COMPOSE DOWN -> DOCKER COMPOSE UP)');
  console.log('======================================================\n');

  const GATEWAY_URL = 'http://localhost:8000';
  const API_URL = `${GATEWAY_URL}/api/v1`;

  // 1. Đăng nhập ADMIN
  console.log('1. Đăng nhập tài khoản ADMIN...');
  const loginRes = await axios.post(`${API_URL}/auth/login`, {
    email: 'admin@csm.vn',
    password: 'Admin@123456',
  });
  const token = loginRes.data.accessToken;
  console.log('   ✅ Đăng nhập thành công, nhận token ADMIN.');

  // 2. Tạo sản phẩm tạm để upload ảnh
  console.log('\n2. Tạo sản phẩm kiểm thử độ bền volume...');
  const prodRes = await axios.post(
    `${API_URL}/products`,
    {
      sku: 'SKU-PERSIST-' + Date.now(),
      name: 'Sản phẩm Kiểm Chứng Docker Volume',
      base_price: 99000,
      description: 'Sản phẩm để kiểm chứng dữ liệu volume tồn tại qua restart',
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const productId = prodRes.data.id;
  console.log(`   ✅ Đã tạo sản phẩm id=${productId}`);

  // 3. Tạo file ảnh với nội dung ngẫu nhiên và tính SHA256
  console.log('\n3. Tạo tệp ảnh PNG với dữ liệu nhị phân ngẫu nhiên độc nhất...');
  const randomPayload = crypto.randomBytes(512);
  const pngHeader = Buffer.from([
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
  const fullImageBuffer = Buffer.concat([pngHeader, randomPayload]);
  const originalSha256 = crypto.createHash('sha256').update(fullImageBuffer).digest('hex');
  console.log(`   🔑 SHA-256 gốc của tệp ảnh trước khi upload: ${originalSha256}`);
  console.log(`   📏 Kích thước tệp: ${fullImageBuffer.length} bytes`);

  // 4. Upload ảnh lên product-service qua Gateway
  console.log('\n4. Thực hiện upload ảnh lên server (POST /products/:id/image)...');
  const fd = new FormData();
  fd.append('image', new Blob([fullImageBuffer], { type: 'image/png' }), 'persist-test.png');
  const uploadRes = await axios.post(`${API_URL}/products/${productId}/image`, fd, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const imageUrl = uploadRes.data.image_url;
  console.log(`   ✅ Upload thành công! URL ảnh trả về: ${imageUrl}`);

  // 5. Kiểm tra GET ảnh trước khi tắt docker compose
  console.log('\n5. Tải ảnh về qua Gateway TRƯỚC KHI down stack (GET ' + imageUrl + ')...');
  const beforeRes = await axios.get(`${GATEWAY_URL}${imageUrl}`, { responseType: 'arraybuffer' });
  const beforeBuffer = Buffer.from(beforeRes.data);
  const beforeSha256 = crypto.createHash('sha256').update(beforeBuffer).digest('hex');
  console.log(`   ✅ Tải ảnh thành công (HTTP ${beforeRes.status})`);
  console.log(`   🔑 SHA-256 ảnh tải về trước khi down: ${beforeSha256}`);
  if (beforeSha256 !== originalSha256) {
    throw new Error('Hash không khớp trước khi restart!');
  }

  // 6. Thực thi docker compose down
  console.log('\n======================================================');
  console.log('🔴 TIẾN HÀNH DOCKER COMPOSE DOWN (Xoá hoàn toàn container & mạng)...');
  console.log('======================================================');
  execSync('docker compose down', { stdio: 'inherit' });
  console.log('✅ Toàn bộ container đã bị gỡ bỏ.');

  // 7. Thực thi docker compose up -d
  console.log('\n======================================================');
  console.log('🟢 TIẾN HÀNH DOCKER COMPOSE UP -D (Khởi động lại toàn bộ stack)...');
  console.log('======================================================');
  execSync('docker compose up -d', { stdio: 'inherit' });

  // 8. Chờ stack healthy
  console.log('\n⏳ Đang chờ các container khởi động và hoàn thành healthcheck...');
  let healthy = false;
  for (let i = 0; i < 30; i++) {
    try {
      const h = await axios.get(`${API_URL}/health`);
      if (h.status === 200) {
        healthy = true;
        break;
      }
    } catch (e) {
      // waiting
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!healthy) {
    throw new Error('Hệ thống không khởi động kịp thời!');
  }
  console.log('✅ Hệ thống API Gateway và các Microservices đã sẵn sàng hoạt động trở lại.');

  // 9. Tải lại ảnh SAU KHI DOCKER COMPOSE UP
  console.log('\n9. Tải ảnh về qua Gateway SAU KHI DOCKER COMPOSE DOWN & UP...');
  console.log(`   GET ${GATEWAY_URL}${imageUrl}`);
  const afterRes = await axios.get(`${GATEWAY_URL}${imageUrl}`, { responseType: 'arraybuffer' });
  const afterBuffer = Buffer.from(afterRes.data);
  const afterSha256 = crypto.createHash('sha256').update(afterBuffer).digest('hex');

  console.log(`   ✅ Tải ảnh thành công (HTTP ${afterRes.status})`);
  console.log(`   🔑 SHA-256 ảnh tải về sau khi down & up: ${afterSha256}`);

  // 10. Đối chiếu chứng minh
  console.log('\n======================================================');
  console.log('📊 ĐỐI CHIẾU CHỨNG MINH TÍNH BẢO TOÀN DỮ LIỆU:');
  console.log('======================================================');
  console.log(`   - SHA256 ban đầu   : ${originalSha256}`);
  console.log(`   - SHA256 trước down: ${beforeSha256}`);
  console.log(`   - SHA256 sau up    : ${afterSha256}`);
  console.log(`   - Trạng thái HTTP  : ${afterRes.status} OK`);
  console.log(`   - Kích thước byte  : ${afterBuffer.length} bytes (Khớp 100%)`);

  if (afterSha256 === originalSha256) {
    console.log('\n🎉 CHỨNG MINH THÀNH CÔNG: Tệp hình ảnh trên Docker Volume product_uploads vẫn tồn tại nguyên vẹn 100% sau khi docker compose down và up!');
  } else {
    throw new Error('❌ THẤT BẠI: Dữ liệu ảnh bị sai lệch sau khi docker compose up!');
  }

  // 11. Dọn dẹp sản phẩm kiểm thử
  try {
    await axios.delete(`${API_URL}/products/${productId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (e) {}
}

testPersistence().catch((err) => {
  console.error('\n❌ Lỗi kiểm chứng persistence:', err.message);
  process.exit(1);
});
