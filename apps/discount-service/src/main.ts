import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import * as mysql from 'mysql2/promise';

async function ensureDatabase() {
  const dbUrl = process.env.DISCOUNT_DB_URL;
  if (!dbUrl) {
    return; // AppModule sẽ fail-fast và báo tên biến DISCOUNT_DB_URL
  }
  try {
    const parsed = new URL(dbUrl);
    const dbName = parsed.pathname.replace(/^\//, '') || 'csm_discount';
    const connection = await mysql.createConnection({
      host: parsed.hostname || 'localhost',
      port: parseInt(parsed.port || '3306', 10),
      user: decodeURIComponent(parsed.username || 'root'),
      password: decodeURIComponent(parsed.password || ''),
    });
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await connection.end();
    console.log(`✅ Database '${dbName}' ready.`);
  } catch (err: any) {
    console.warn('⚠️ Auto-create database csm_discount warning:', err?.message || err);
  }
}

async function bootstrap() {
  await ensureDatabase();
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const PORT = process.env.DISCOUNT_PORT || process.env.PORT || 3007;
  await app.listen(PORT);
  console.log(`🎟️ Discount & Voucher Service đang chạy tại port: ${PORT}`);
}
bootstrap();
