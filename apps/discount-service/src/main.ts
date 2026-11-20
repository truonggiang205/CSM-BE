import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import * as mysql from 'mysql2/promise';

async function ensureDatabase() {
  const dbUrl = process.env.DISCOUNT_DB_URL || 'mysql://root:rootpassword@localhost:3306/csm_discount';
  try {
    const parsed = new URL(dbUrl);
    const dbName = parsed.pathname.replace(/^\//, '') || 'csm_discount';
    const connection = await mysql.createConnection({
      host: parsed.hostname || 'localhost',
      port: parseInt(parsed.port || '3306', 10),
      user: decodeURIComponent(parsed.username || 'root'),
      password: decodeURIComponent(parsed.password || 'rootpassword'),
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
  const PORT = process.env.PORT || 3007;
  await app.listen(PORT);
  console.log(`🎟️ Discount & Voucher Service đang chạy tại port: ${PORT}`);
}
bootstrap();
