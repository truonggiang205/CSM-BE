import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const PORT = process.env.PORT || 3004;
  await app.listen(PORT);
  console.log(`🛒 Order Service đang chạy tại port: ${PORT}`);
}
bootstrap();
