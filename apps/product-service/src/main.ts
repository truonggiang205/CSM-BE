import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { MulterExceptionFilter } from './filters/multer-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new MulterExceptionFilter());
  const PORT = process.env.PRODUCT_PORT || 3002;
  await app.listen(PORT);
  console.log(`📦 Product & Branch Service đang chạy tại port: ${PORT}`);
}
bootstrap();
