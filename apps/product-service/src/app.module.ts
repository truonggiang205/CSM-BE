import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductController } from './product.controller';
import { Product } from './entities/product.entity';
import { Category } from './entities/category.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env', // Load from root
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        url: configService.get<string>('PRODUCT_DB_URL'),
        entities: [Product, Category],
        synchronize: true, // Use only in dev
        ssl: {
          rejectUnauthorized: false, // Required by Aiven MySQL
        },
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([Product, Category]),
  ],
  controllers: [ProductController],
  providers: [],
})
export class AppModule {}
