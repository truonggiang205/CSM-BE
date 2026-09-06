import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Bật CORS cho phép Frontend truy cập
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  });
  app.setGlobalPrefix('api/v1');

  const PORT = process.env.PORT || 8000;
  await app.listen(PORT);
  console.log(`🚀 API Gateway đang chạy tại: http://localhost:${PORT}/api/v1`);
}
bootstrap();
