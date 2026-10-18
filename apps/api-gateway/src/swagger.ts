import { INestApplication } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('CSM Convenience Store Microservices API')
    .setDescription(
      'Hệ thống Backend Microservices cho chuỗi cửa hàng tiện lợi CSM.\n\n' +
      'Bao gồm các dịch vụ:\n' +
      '- **Auth Service** (Port 3001): Xác thực, cấp JWT token (Access & Refresh), phân quyền người dùng (CUSTOMER, BRANCH_MANAGER, ADMIN).\n' +
      '- **Product Service** (Port 3002): Quản lý danh mục và thông tin sản phẩm.\n' +
      '- **Inventory Service** (Port 3003): Quản lý chi nhánh (Haversine GPS), tồn kho đa chi nhánh, Saga giữ/trừ/hoàn kho với Pessimistic Locking và Idempotency.\n' +
      '- **Order Service** (Port 3004): Quản lý vòng đời đơn hàng (State Machine), điều phối phân tán Saga, truy vấn lọc đơn đa tiêu chí theo chi nhánh.\n' +
      '- **Payment Service** (Port 3005): Mô phỏng cổng thanh toán trực tuyến bảo mật (Momo / ATM), chống tấn công bypass.\n' +
      '- **Notification Service** (Port 3006): Mô phỏng gửi email, SMS và push notification theo sự kiện.\n'
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Nhập JWT Access Token vào đây (ví dụ: eyJhbGciOi...)',
        in: 'header',
      },
      'BearerAuth',
    )
    .build();

  // Xây dựng OpenAPI Document với đầy đủ schema và ví dụ mẫu cho từng endpoint
  const document = SwaggerModule.createDocument(app, config);

  // Bổ sung các routes và schemas chi tiết cho API Gateway
  document.paths = {
    ...document.paths,

    // ==========================================
    // 1. AUTH SERVICE ENDPOINTS
    // ==========================================
    '/api/v1/auth/register': {
      post: {
        tags: ['1. Authentication'],
        summary: 'Đăng ký tài khoản khách hàng mới',
        description: 'Tạo tài khoản khách hàng mới. BẢO MẬT: Mọi yêu cầu đăng ký luôn được gán cứng role CUSTOMER, loại bỏ mọi cố gắng nâng quyền.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'customer.moi@csm.vn' },
                  password: { type: 'string', minLength: 6, example: 'MatKhau@123' },
                  fullName: { type: 'string', example: 'Nguyễn Văn A' },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Đăng ký thành công, trả về thông tin user và cặp token',
            content: {
              'application/json': {
                example: {
                  message: 'Đăng ký tài khoản thành công',
                  user: {
                    id: 'usr-c5a4d0e1',
                    email: 'customer.moi@csm.vn',
                    role: 'CUSTOMER',
                    fullName: 'Nguyễn Văn A',
                  },
                  accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                  refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                },
              },
            },
          },
          400: { description: 'Email không hợp lệ hoặc mật khẩu dưới 6 ký tự' },
          409: { description: 'Email đã được đăng ký trong hệ thống' },
        },
      },
    },

    '/api/v1/auth/login': {
      post: {
        tags: ['1. Authentication'],
        summary: 'Đăng nhập hệ thống',
        description: 'Đăng nhập bằng email và mật khẩu (hỗ trợ cả hash bcrypt native $2b$ cũ và bcryptjs thuần JS).',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', example: 'customer@csm.vn' },
                  password: { type: 'string', example: 'Customer@123456' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Đăng nhập thành công',
            content: {
              'application/json': {
                example: {
                  message: 'Đăng nhập thành công',
                  user: {
                    id: 'usr-01',
                    email: 'customer@csm.vn',
                    role: 'CUSTOMER',
                    branch_id: null,
                  },
                  accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                  refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                },
              },
            },
          },
          401: { description: 'Email hoặc mật khẩu không chính xác' },
        },
      },
    },

    '/api/v1/auth/refresh': {
      post: {
        tags: ['1. Authentication'],
        summary: 'Làm mới Access Token',
        description: 'Sử dụng Refresh Token hợp lệ (claim type: "refresh") để lấy cặp token mới. Từ chối nếu đưa vào Access Token.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: {
                  refreshToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Cấp token mới thành công',
            content: {
              'application/json': {
                example: {
                  accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                  refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                },
              },
            },
          },
          401: { description: 'Refresh token không hợp lệ hoặc đã hết hạn' },
        },
      },
    },

    '/api/v1/auth/profile': {
      get: {
        tags: ['1. Authentication'],
        summary: 'Lấy thông tin tài khoản hiện tại',
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Thông tin tài khoản',
            content: {
              'application/json': {
                example: {
                  id: 'usr-01',
                  email: 'customer@csm.vn',
                  role: 'CUSTOMER',
                  branch_id: null,
                  created_at: '2026-10-18T10:00:00.000Z',
                },
              },
            },
          },
          401: { description: 'Chưa đăng nhập hoặc token không hợp lệ' },
        },
      },
    },

    // ==========================================
    // 2. PRODUCT SERVICE ENDPOINTS
    // ==========================================
    '/api/v1/products': {
      get: {
        tags: ['2. Products & Categories'],
        summary: 'Lấy danh sách sản phẩm',
        description: 'Lấy toàn bộ danh sách sản phẩm kèm thông tin danh mục tương ứng.',
        responses: {
          200: {
            description: 'Danh sách sản phẩm',
            content: {
              'application/json': {
                example: [
                  {
                    id: 'prod-01',
                    sku: 'SKU-DRK-001',
                    name: 'Trà Sữa Hồng Trà Truyền Thống',
                    description: 'Trà sữa đậm vị hồng trà cùng trân châu đen dai giòn',
                    base_price: 35000,
                    image_url: 'https://images.unsplash.com/photo-1558857563-b371033873b8?w=500',
                    category: { id: 'cat-01', name: 'Đồ uống & Trà sữa' },
                  },
                ],
              },
            },
          },
        },
      },
      post: {
        tags: ['2. Products & Categories'],
        summary: 'Tạo sản phẩm mới (ADMIN)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['sku', 'name', 'base_price'],
                properties: {
                  sku: { type: 'string', example: 'SKU-SNK-999' },
                  name: { type: 'string', example: 'Bánh Snack Phô Mai' },
                  description: { type: 'string', example: 'Snack giòn tan vị bắp phô mai' },
                  base_price: { type: 'number', example: 15000 },
                  category_id: { type: 'string', example: 'cat-02' },
                  image_url: { type: 'string', example: 'https://images.unsplash.com/...' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Tạo sản phẩm thành công' },
          403: { description: 'Không đủ quyền (Yêu cầu ADMIN)' },
        },
      },
    },

    '/api/v1/products/{id}': {
      get: {
        tags: ['2. Products & Categories'],
        summary: 'Chi tiết sản phẩm theo ID',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, example: 'prod-01' },
        ],
        responses: {
          200: { description: 'Chi tiết sản phẩm' },
          404: { description: 'Không tìm thấy sản phẩm' },
        },
      },
      put: {
        tags: ['2. Products & Categories'],
        summary: 'Cập nhật sản phẩm (ADMIN)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'Trà Sữa Hồng Trà Đặc Biệt' },
                  base_price: { type: 'number', example: 40000 },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Cập nhật thành công' },
          403: { description: 'Không đủ quyền (Yêu cầu ADMIN)' },
          404: { description: 'Không tìm thấy sản phẩm' },
        },
      },
      delete: {
        tags: ['2. Products & Categories'],
        summary: 'Xoá sản phẩm (ADMIN)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Xoá sản phẩm thành công' },
          403: { description: 'Không đủ quyền (Yêu cầu ADMIN)' },
        },
      },
    },

    '/api/v1/categories': {
      get: {
        tags: ['2. Products & Categories'],
        summary: 'Lấy danh mục sản phẩm',
        responses: {
          200: {
            description: 'Danh sách danh mục',
            content: {
              'application/json': {
                example: [
                  { id: 'cat-01', name: 'Đồ uống & Trà sữa', description: 'Trà sữa, cà phê, nước giải khát' },
                  { id: 'cat-02', name: 'Bánh mì & Ăn nhẹ', description: 'Đồ ăn nhanh ăn liền' },
                ],
              },
            },
          },
        },
      },
    },

    // ==========================================
    // 3. BRANCH SERVICE ENDPOINTS
    // ==========================================
    '/api/v1/branches': {
      get: {
        tags: ['3. Branches'],
        summary: 'Lấy danh sách chi nhánh đang hoạt động',
        description: 'Chỉ trả về các chi nhánh có `is_active = true`.',
        responses: {
          200: {
            description: 'Danh sách chi nhánh',
            content: {
              'application/json': {
                example: [
                  {
                    id: 'br-01',
                    name: 'CSM Bến Nghé - Quận 1',
                    address: '12 Lê Lợi, Bến Nghé, Quận 1, TP.HCM',
                    latitude: 10.776889,
                    longitude: 106.700806,
                    is_active: true,
                  },
                  {
                    id: 'br-02',
                    name: 'CSM Thảo Điền - Quận 2',
                    address: '45 Xuân Thủy, Thảo Điền, Quận 2, TP.HCM',
                    latitude: 10.804167,
                    longitude: 106.738056,
                    is_active: true,
                  },
                ],
              },
            },
          },
        },
      },
      post: {
        tags: ['3. Branches'],
        summary: 'Tạo chi nhánh mới (ADMIN)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'address'],
                properties: {
                  name: { type: 'string', example: 'CSM Phú Nhuận' },
                  address: { type: 'string', example: '100 Phan Xích Long, Phú Nhuận, TP.HCM' },
                  latitude: { type: 'number', example: 10.7963 },
                  longitude: { type: 'number', example: 106.6852 },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Tạo chi nhánh thành công' },
          403: { description: 'Không đủ quyền (Yêu cầu ADMIN)' },
        },
      },
    },

    '/api/v1/branches/nearest': {
      get: {
        tags: ['3. Branches'],
        summary: 'Tìm chi nhánh gần nhất theo toạ độ GPS',
        description: 'Sử dụng công thức Haversine để tính khoảng cách theo đường cong Trái Đất (km) dựa trên toạ độ lat và lng.',
        parameters: [
          { name: 'lat', in: 'query', required: true, schema: { type: 'number' }, example: 10.776 },
          { name: 'lng', in: 'query', required: true, schema: { type: 'number' }, example: 106.701 },
        ],
        responses: {
          200: {
            description: 'Chi nhánh gần nhất kèm khoảng cách (km)',
            content: {
              'application/json': {
                example: {
                  id: 'br-01',
                  name: 'CSM Bến Nghé - Quận 1',
                  address: '12 Lê Lợi, Bến Nghé, Quận 1, TP.HCM',
                  latitude: 10.776889,
                  longitude: 106.700806,
                  is_active: true,
                  distance_km: 0.12,
                },
              },
            },
          },
          400: { description: 'Toạ độ không hợp lệ hoặc thiếu tham số' },
        },
      },
    },

    '/api/v1/branches/{id}': {
      delete: {
        tags: ['3. Branches'],
        summary: 'Xóa mềm chi nhánh (ADMIN)',
        description: 'Vô hiệu hóa chi nhánh (is_active = false). BẢO MẬT: Từ chối với HTTP 409 nếu chi nhánh còn hàng tồn kho > 0 hoặc còn đơn hàng PENDING/CONFIRMED.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, example: 'br-01' },
        ],
        responses: {
          200: { description: 'Đã vô hiệu hóa (xóa mềm) chi nhánh' },
          409: { description: 'Xung đột: Chi nhánh còn tồn kho hoặc đơn hàng đang xử lý' },
        },
      },
    },

    // ==========================================
    // 4. INVENTORY SERVICE ENDPOINTS
    // ==========================================
    '/api/v1/inventory/product/{id}': {
      get: {
        tags: ['4. Inventory'],
        summary: 'Kiểm tra tồn kho của sản phẩm tại tất cả chi nhánh',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, example: 'prod-01' },
        ],
        responses: {
          200: {
            description: 'Số lượng tồn, số lượng đang giữ (reserved) và có sẵn (available = quantity - reserved)',
            content: {
              'application/json': {
                example: [
                  {
                    branch_id: 'br-01',
                    branch_name: 'CSM Bến Nghé - Quận 1',
                    branch_address: '12 Lê Lợi, Bến Nghé, Quận 1, TP.HCM',
                    quantity: 100,
                    reserved_quantity: 5,
                    available: 95,
                  },
                ],
              },
            },
          },
        },
      },
    },

    '/api/v1/inventory/branch/{branchId}': {
      get: {
        tags: ['4. Inventory'],
        summary: 'Lấy toàn bộ tồn kho tại một chi nhánh cụ thể',
        parameters: [
          { name: 'branchId', in: 'path', required: true, schema: { type: 'string' }, example: 'br-01' },
        ],
        responses: {
          200: { description: 'Danh sách tồn kho theo chi nhánh' },
        },
      },
    },

    '/api/v1/inventory/add-stock': {
      post: {
        tags: ['4. Inventory'],
        summary: 'Nhập hàng vào kho chi nhánh (ADMIN / BRANCH_MANAGER)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['branchId', 'productId', 'quantity'],
                properties: {
                  branchId: { type: 'string', example: 'br-01' },
                  productId: { type: 'string', example: 'prod-01' },
                  quantity: { type: 'number', minimum: 1, example: 50 },
                  referenceId: { type: 'string', example: 'PO-2026-10-001' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Nhập kho thành công và ghi sổ StockTransaction IN' },
          403: { description: 'Không đủ quyền hạn' },
        },
      },
    },

    '/api/v1/inventory/reserve-stock': {
      post: {
        tags: ['4. Inventory'],
        summary: 'SAGA Bước 1: Giữ chỗ hàng tồn kho (Nội bộ / Saga)',
        description: 'Sử dụng Pessimistic Locking (`pessimistic_write`) chống race condition và Idempotent theo referenceId + stock_id.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['branchId', 'items', 'referenceId'],
                properties: {
                  branchId: { type: 'string', example: 'br-01' },
                  referenceId: { type: 'string', example: 'order-uuid-123' },
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        productId: { type: 'string', example: 'prod-01' },
                        quantity: { type: 'number', example: 2 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Giữ hàng thành công hoặc kết quả Idempotent' },
          400: { description: 'Hết hàng hoặc số lượng yêu cầu vượt quá số lượng có sẵn' },
        },
      },
    },

    // ==========================================
    // 5. ORDER SERVICE ENDPOINTS
    // ==========================================
    '/api/v1/orders': {
      post: {
        tags: ['5. Orders'],
        summary: 'Đặt hàng mới (COD hoặc Trực tuyến)',
        description: 'Xác thực tồn kho, gọi Saga giữ hàng tạm thời (reserve-stock), lưu đơn hàng PENDING. Nếu chọn phương thức trực tuyến (MOMO/ATM), hệ thống tạo link thanh toán mô phỏng.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['branchId', 'items', 'shippingAddress', 'paymentMethod'],
                properties: {
                  branchId: { type: 'string', example: 'br-01' },
                  shippingAddress: { type: 'string', example: '123 Đường Nguyễn Huệ, Quận 1, TP.HCM' },
                  paymentMethod: { type: 'string', enum: ['COD', 'MOMO', 'ATM'], example: 'COD' },
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['productId', 'quantity'],
                      properties: {
                        productId: { type: 'string', example: 'prod-01' },
                        quantity: { type: 'number', minimum: 1, example: 2 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Đặt hàng thành công',
            content: {
              'application/json': {
                example: {
                  success: true,
                  message: 'Đặt hàng thành công!',
                  orderId: 'b6f4e667-15d9-43c2-8419-f5ce8c843c08',
                  status: 'PENDING',
                  paymentUrl: null,
                },
              },
            },
          },
          400: { description: 'Không đủ tồn kho hoặc chi nhánh không hợp lệ' },
          404: { description: 'Sản phẩm không tồn tại' },
        },
      },
      get: {
        tags: ['5. Orders'],
        summary: 'Quản trị danh sách đơn hàng (BRANCH_MANAGER / ADMIN)',
        description: 'Lọc đa tiêu chí: status, branchId (ép chặt theo chi nhánh của Manager), tìm kiếm search mã đơn, lọc khoảng ngày fromDate/toDate. Phân trang chuẩn { items, total, page, limit, totalPages }.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'number', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'number', default: 10 } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['PENDING', 'CONFIRMED', 'PAID', 'SHIPPED', 'CANCELLED'] } },
          { name: 'branchId', in: 'query', schema: { type: 'string' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'fromDate', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'toDate', in: 'query', schema: { type: 'string', format: 'date-time' } },
        ],
        responses: {
          200: {
            description: 'Danh sách đơn hàng',
            content: {
              'application/json': {
                example: {
                  items: [],
                  total: 0,
                  page: 1,
                  limit: 10,
                  totalPages: 0,
                },
              },
            },
          },
          403: { description: 'CUSTOMER bị cấm truy cập danh sách quản trị' },
        },
      },
    },

    '/api/v1/orders/my': {
      get: {
        tags: ['5. Orders'],
        summary: 'Khách hàng xem lịch sử đơn hàng của mình',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'number', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'number', default: 10 } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Danh sách đơn hàng của người dùng đang đăng nhập' },
          401: { description: 'Chưa đăng nhập' },
        },
      },
    },

    '/api/v1/orders/{id}': {
      get: {
        tags: ['5. Orders'],
        summary: 'Xem chi tiết đơn hàng',
        description: 'BẢO MẬT: Khách hàng chỉ xem được đơn của mình (403 nếu xem đơn người khác). Branch Manager chỉ xem được đơn thuộc chi nhánh mình phụ trách.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Thông tin chi tiết đơn hàng' },
          403: { description: 'Không có quyền truy cập đơn hàng này' },
          404: { description: 'Không tìm thấy đơn hàng' },
        },
      },
    },

    '/api/v1/orders/{id}/status': {
      patch: {
        tags: ['5. Orders'],
        summary: 'Cập nhật trạng thái đơn hàng (State Machine & Saga)',
        description: 'Tuân thủ nghiêm ngặt State Machine:\n- PENDING -> CONFIRMED hoặc CANCELLED\n- CONFIRMED -> PAID hoặc SHIPPED hoặc CANCELLED\n- PAID -> SHIPPED hoặc CANCELLED\n- SHIPPED & CANCELLED: Trạng thái kết thúc (Terminal).\n\nKhi xác nhận đơn (PENDING -> CONFIRMED/PAID), Saga tự động gọi confirm-deduct kho. Khi huỷ đơn PENDING, Saga tự động gọi release-stock hoàn trả kho.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: { type: 'string', enum: ['CONFIRMED', 'PAID', 'SHIPPED', 'CANCELLED'], example: 'CONFIRMED' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Cập nhật trạng thái thành công' },
          400: { description: 'Chuyển trạng thái không hợp lệ theo State Machine' },
          403: { description: 'Không có quyền thay đổi trạng thái đơn hàng' },
        },
      },
    },

    // ==========================================
    // 6. PAYMENT SERVICE ENDPOINTS
    // ==========================================
    '/api/v1/payments/create': {
      post: {
        tags: ['6. Payments'],
        summary: 'Tạo link thanh toán trực tuyến mô phỏng',
        description: 'Tạo URL thanh toán có gắn token ký số JWT thời hạn 10 phút. BẢO MẬT: Bắt buộc xác thực chủ đơn hoặc ADMIN.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['orderId', 'amount', 'method'],
                properties: {
                  orderId: { type: 'string', example: 'b6f4e667-15d9-43c2-8419-f5ce8c843c08' },
                  amount: { type: 'number', example: 70000 },
                  method: { type: 'string', enum: ['MOMO', 'ATM'], example: 'MOMO' },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Link thanh toán mô phỏng',
            content: {
              'application/json': {
                example: {
                  success: true,
                  message: 'Đã tạo link thanh toán',
                  paymentUrl: 'http://localhost:8000/api/v1/payments/simulate-success/order-id?token=eyJ...',
                },
              },
            },
          },
          400: { description: 'Đơn hàng COD không được thanh toán trực tuyến' },
          403: { description: 'Không có quyền thanh toán đơn hàng này' },
        },
      },
    },

    '/api/v1/payments/simulate-success/{orderId}': {
      get: {
        tags: ['6. Payments'],
        summary: 'Trang HTML giao diện mô phỏng cổng thanh toán (GET redirect)',
        description: 'Endpoint dành cho trình duyệt khách hàng hiển thị giao diện xác nhận thanh toán mô phỏng. BẢO MẬT: GET KHÔNG ĐƯỢC PHÉP thay đổi trạng thái đơn hàng hay trừ kho.',
        parameters: [
          { name: 'orderId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'token', in: 'query', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Giao diện HTML trang thanh toán an toàn' },
          401: { description: 'Token xác thực thanh toán không hợp lệ hoặc đã hết hạn' },
        },
      },
    },

    '/api/v1/payments/simulate-confirm': {
      post: {
        tags: ['6. Payments'],
        summary: 'Xác nhận thanh toán mô phỏng (Chuyển trạng thái PAID & trừ kho)',
        description: 'Xác thực token JWT, kích hoạt Saga chuyển đơn hàng sang PAID và trừ tồn kho chính thức. Hỗ trợ Idempotency: nếu gọi lần thứ 2, giữ nguyên trạng thái và không trừ kho lặp lại.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['orderId', 'token'],
                properties: {
                  orderId: { type: 'string', example: 'b6f4e667-15d9-43c2-8419-f5ce8c843c08' },
                  token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Thanh toán thành công hoặc kết quả Idempotent' },
          400: { description: 'Đơn hàng đã bị hủy hoặc phương thức COD không hợp lệ' },
          401: { description: 'Token không hợp lệ' },
        },
      },
    },
  };

  // Thiết lập đường dẫn Swagger UI: cả /docs và /api/v1/docs
  SwaggerModule.setup('docs', app, document, {
    customSiteTitle: 'CSM Microservices API Documentation',
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true,
    },
  });

  SwaggerModule.setup('api/v1/docs', app, document, {
    customSiteTitle: 'CSM Microservices API Documentation',
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true,
    },
  });
}
