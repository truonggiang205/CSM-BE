import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

import { setupSwagger } from './swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Bật CORS cho phép Frontend truy cập
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  });

  // Chặn path traversal sớm trước khi router chuẩn hóa path
  app.use((req: any, res: any, next: any) => {
    const rawUrl = req.originalUrl || req.url || '';
    if (
      rawUrl.includes('/uploads') &&
      (rawUrl.includes('..') || rawUrl.toLowerCase().includes('%2e'))
    ) {
      return res.status(400).json({
        statusCode: 400,
        message: 'Phát hiện path traversal không hợp lệ',
      });
    }
    next();
  });

  app.setGlobalPrefix('api/v1', {
    exclude: ['docs', 'docs/(.*)', 'uploads', 'uploads/(.*)'],
  });

  // Chỉ bật Swagger trong môi trường dev hoặc khi ENABLE_SWAGGER=true
  const isDev = process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true';
  if (isDev) {
    setupSwagger(app);
  }

  const PORT = process.env.PORT || 8000;
  await app.listen(PORT);
  console.log(`🚀 API Gateway đang chạy tại: http://localhost:${PORT}/api/v1`);
  if (isDev) {
    console.log(`📑 Swagger UI đang mở tại: http://localhost:${PORT}/docs`);
  }
}
bootstrap();
