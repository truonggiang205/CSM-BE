import { Controller, All, Req, Res, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import axios from 'axios';

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

function isPublicEndpoint(method: string, path: string): boolean {
  const normPath = path.replace(/^\/api\/v1/, '');
  const m = method.toUpperCase();

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

  return false;
}

@Controller()
export class ProxyController {
  constructor(private readonly jwtService: JwtService) {}

  @All('*')
  async handleProxy(@Req() req: Request, @Res() res: Response) {
    const pathParts = req.path.replace(/^\/api\/v1\//, '').split('/');
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

    const isPublic = isPublicEndpoint(req.method, req.path);
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const payload = this.jwtService.verify(token, {
          secret: process.env.JWT_SECRET || 'csm-super-secret-key-production-change-me',
        });

        // Chuyển tiếp định danh an toàn xuống các downstream microservices
        headers['x-user-id'] = payload.sub || payload.id;
        headers['x-user-email'] = payload.email || '';
        headers['x-user-role'] = payload.role || 'CUSTOMER';
        headers['x-branch-id'] = payload.branch_id || '';
      } catch (err: any) {
        if (!isPublic) {
          return res.status(HttpStatus.UNAUTHORIZED).json({
            statusCode: HttpStatus.UNAUTHORIZED,
            message: 'Token xác thực không hợp lệ hoặc đã hết hạn',
          });
        }
      }
    } else if (!isPublic) {
      return res.status(HttpStatus.UNAUTHORIZED).json({
        statusCode: HttpStatus.UNAUTHORIZED,
        message: 'Yêu cầu cần Access Token xác thực (Bearer Token)',
      });
    }

    const targetUrl = `${targetBaseUrl}${req.originalUrl.replace('/api/v1', '')}`;

    try {
      const response = await axios({
        method: req.method,
        url: targetUrl,
        data: req.body,
        params: req.query,
        headers,
        validateStatus: () => true, // Không throw exception nếu status >= 400
      });

      return res.status(response.status).json(response.data);
    } catch (error: any) {
      return res.status(HttpStatus.BAD_GATEWAY).json({
        statusCode: HttpStatus.BAD_GATEWAY,
        message: `API Gateway: Không thể kết nối tới Microservice (${targetKey}) tại ${targetBaseUrl}`,
        error: error.message,
      });
    }
  }
}
