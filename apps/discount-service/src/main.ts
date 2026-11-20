import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const PORT = process.env.PORT || 3007;
  await app.listen(PORT);
  console.log(`🎟️ Discount & Voucher Service đang chạy tại port: ${PORT}`);
}
bootstrap();