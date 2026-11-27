import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const PORT = process.env.NOTIFICATION_PORT || process.env.PORT || 3006;
  await app.listen(PORT);
  console.log(`Notification Service is running on: http://localhost:${PORT}`);
}
bootstrap();
