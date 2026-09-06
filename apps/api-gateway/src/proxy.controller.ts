import { Controller, All, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import axios from 'axios';

// Định tuyến cổng của 4 Microservices nội bộ
const SERVICE_MAP: Record<string, string> = {
  auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
  products: process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002',
  branches: process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002',
  inventory: process.env.INVENTORY_SERVICE_URL || 'http://localhost:3003',
  orders: process.env.ORDER_SERVICE_URL || 'http://localhost:3004',
};

@Controller()
export class ProxyController {
  @All('*')
  async handleProxy(@Req() req: Request, @Res() res: Response) {
    const pathParts = req.path.replace(/^\/api\/v1\//, '').split('/');
    const targetKey = pathParts[0];
    const targetBaseUrl = SERVICE_MAP[targetKey];

    if (!targetBaseUrl) {
      return res.status(404).json({
        statusCode: 404,
        message: `API Gateway: Service không tồn tại cho tiền tố '/${targetKey}'`,
      });
    }

    const targetUrl = `${targetBaseUrl}${req.originalUrl.replace('/api/v1', '')}`;

    try {
      const response = await axios({
        method: req.method,
        url: targetUrl,
        data: req.body,
        params: req.query,
        headers: {
          ...req.headers,
          host: new URL(targetBaseUrl).host,
        },
        validateStatus: () => true, // Không throw exception nếu status >= 400
      });

      return res.status(response.status).json(response.data);
    } catch (error: any) {
      return res.status(502).json({
        statusCode: 502,
        message: `API Gateway: Không thể kết nối tới Microservice (${targetKey}) tại ${targetBaseUrl}`,
        error: error.message,
      });
    }
  }
}
