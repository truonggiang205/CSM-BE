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
  app.setGlobalPrefix('api/v1', {
    exclude: ['docs', 'docs/(.*)'],
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
