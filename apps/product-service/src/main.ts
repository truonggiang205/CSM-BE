import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const PORT = process.env.PORT || 3002;
  await app.listen(PORT);
  console.log(`📦 Product & Branch Service đang chạy tại port: ${PORT}`);
}
bootstrap();
