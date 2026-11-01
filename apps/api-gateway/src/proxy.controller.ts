import { Controller, All, Get, Param, Req, Res, Next, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

// Định tuyến cổng của các Microservices nội bộ
const SERVICE_MAP: Record<string, string> = {
  auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
  products: process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002',
  categories: process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002',
  branches: process.env.INVENTORY_SERVICE_URL || 'http://localhost:3003',
  inventory: process.env.INVENTORY_SERVICE_URL || 'http://localhost:3003',
  orders: process.env.ORDER_SERVICE_URL || 'http://localhost:3004',
  payments: process.env.PAYMENT_SERVICE_URL || 'http://localhost:3005',
  notifications: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3006',
};

function isPublicEndpoint(method: string, pathUrl: string): boolean {
  const normPath = '/' + pathUrl.replace(/^\/?(api\/v1\/)?/, '');
  const m = method.toUpperCase();

  if (normPath === '/health') {
    return true;
  }

  // Swagger Documentation routes
  if (normPath.startsWith('/docs') || normPath.startsWith('/swagger')) {
    return true;
  }

  // File uploads route is public
  if (normPath.startsWith('/uploads')) {
    return true;
  }

  // 1. Auth public endpoints
  if (normPath.startsWith('/auth/register') || normPath.startsWith('/auth/login') || normPath.startsWith('/auth/refresh')) {
    return true;
  }

  // 2. Public GET catalog & inventory endpoints
  if (m === 'GET') {
    if (
      normPath.startsWith('/products') ||
      normPath.startsWith('/categories') ||
      normPath.startsWith('/branches') ||
      normPath.startsWith('/inventory')
    ) {
      return true;
    }
  }

  // 3. Payment simulation endpoint (hỗ trợ trình duyệt redirect mô phỏng thanh toán)
  if (normPath.startsWith('/payments/simulate-success')) {
    return true;
  }

  return false;
}

@Controller()
export class ProxyController {
  constructor(private readonly jwtService: JwtService) {}

  @All('health')
  getHealth() {
    return { status: 'ok', service: 'api-gateway' };
  }

  @Get('uploads/:filename')
  async getUploadFile(@Param('filename') filename: string, @Res() res: Response) {
    return this.serveUploadFile(filename, res);
  }

  @Get('api/v1/uploads/:filename')
  async getUploadFileWithPrefix(@Param('filename') filename: string, @Res() res: Response) {
    return this.serveUploadFile(filename, res);
  }

  private async serveUploadFile(filename: string, res: Response) {
    // Chặn path traversal tuyệt đối
    if (
      !filename ||
      filename.includes('..') ||
      filename.includes('/') ||
      filename.includes('\\') ||
      filename.includes('%')
    ) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Phát hiện path traversal không hợp lệ',
      });
    }

    const safeFilename = path.basename(filename);
    if (filename !== safeFilename) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Phát hiện path traversal không hợp lệ',
      });
    }

    const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads'));
    const safePath = path.resolve(uploadDir, safeFilename);

    if (!safePath.startsWith(uploadDir + path.sep)) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Phát hiện path traversal không hợp lệ',
      });
    }

    // 1. Phục vụ trực tiếp từ Docker volume dùng chung nếu tệp tồn tại
    if (fs.existsSync(safePath)) {
      return res.sendFile(safePath);
    }

    // 2. Dự phòng chuyển tiếp qua product-service nếu chưa có ở đĩa local
    try {
      const productBaseUrl = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002';
      const upstream = await axios.get(`${productBaseUrl}/uploads/${safeFilename}`, {
        responseType: 'stream',
        validateStatus: () => true,
      });

      if (upstream.status === 200) {
        const contentType = upstream.headers['content-type'];
        if (contentType) {
          res.setHeader('content-type', String(contentType));
        }
        return upstream.data.pipe(res);
      }
    } catch (err) {
      // upstream error
    }

    return res.status(HttpStatus.NOT_FOUND).json({
      statusCode: HttpStatus.NOT_FOUND,
      message: 'Không tìm thấy hình ảnh',
    });
  }

  @All('*')
  async handleProxy(@Req() req: Request, @Res() res: Response, @Next() next: any) {
    // Chặn path traversal nếu client gửi URL chứa uploads và ..
    if (
      req.path.includes('/uploads') &&
      (req.path.includes('..') || req.path.includes('%2e') || req.path.includes('%2E'))
    ) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Phát hiện path traversal không hợp lệ',
      });
    }

    const cleanPath = req.path.replace(/^\/?(api\/v1\/)?/, '');
    if (cleanPath.startsWith('docs') || cleanPath.startsWith('swagger') || req.path.includes('/docs')) {
      return next();
    }
    const pathParts = cleanPath.split('/');
    const targetKey = pathParts[0];
    const targetBaseUrl = SERVICE_MAP[targetKey];

    if (!targetBaseUrl) {
      return res.status(HttpStatus.NOT_FOUND).json({
        statusCode: HttpStatus.NOT_FOUND,
        message: `API Gateway: Service không tồn tại cho tiền tố '/${targetKey}'`,
      });
    }

    const headers: Record<string, string | string[] | undefined> = {
      ...req.headers,
      host: new URL(targetBaseUrl).host,
    };

    // BẢO MẬT CHỐNG GIẢ MẠO: Xoá tuyệt đối mọi header x-user-* do client gửi lên (cả route công khai)
    delete headers['x-user-id'];
    delete headers['x-user-email'];
    delete headers['x-user-role'];
    delete headers['x-branch-id'];

    const isPublic = isPublicEndpoint(req.method, req.path);
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const payload = this.jwtService.verify(token, {
          secret: process.env.JWT_SECRET || 'csm-super-secret-key-production-change-me',
        });

        // Chỉ chấp nhận token loại access, từ chối refresh token dùng làm bearer auth
        if (payload.type && payload.type !== 'access') {
          throw new Error('Loại token không hợp lệ (không phải access token)');
        }

        // Chuyển tiếp định danh an toàn xuống các downstream microservices
        headers['x-user-id'] = payload.sub || payload.id;
        headers['x-user-email'] = payload.email || '';
        headers['x-user-role'] = payload.role || 'CUSTOMER';
        headers['x-branch-id'] = payload.branch_id || '';
      } catch (err: any) {
        if (!isPublic) {
          return res.status(HttpStatus.UNAUTHORIZED).json({
            statusCode: HttpStatus.UNAUTHORIZED,
            message: 'Token xác thực không hợp lệ, không đúng loại hoặc đã hết hạn',
          });
        }
      }
    } else if (!isPublic) {
      return res.status(HttpStatus.UNAUTHORIZED).json({
        statusCode: HttpStatus.UNAUTHORIZED,
        message: 'Yêu cầu cần Access Token xác thực (Bearer Token)',
      });
    }

    const targetUrl = `${targetBaseUrl}/${cleanPath}`;

    // Kiểm tra xem request có phải multipart/form-data không
    const isMultipart = req.headers['content-type']?.includes('multipart/form-data');

    try {
      const response = await axios({
        method: req.method,
        url: targetUrl,
        data: isMultipart ? req : (['GET', 'HEAD'].includes(req.method.toUpperCase()) ? undefined : req.body),
        params: req.query,
        headers,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        validateStatus: () => true, // Không throw exception nếu status >= 400
      });

      const contentType = response.headers['content-type'];
      if (contentType) {
        res.setHeader('content-type', String(contentType));
      }
      return res.status(response.status).send(response.data);
    } catch (error: any) {
      return res.status(HttpStatus.BAD_GATEWAY).json({
        statusCode: HttpStatus.BAD_GATEWAY,
        message: `API Gateway: Không thể kết nối tới Microservice (${targetKey}) tại ${targetBaseUrl}`,
        error: error.message,
      });
    }
  }
}
