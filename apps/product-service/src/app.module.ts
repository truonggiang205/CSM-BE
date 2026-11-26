import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createEnvValidator } from '@csm/config';
import { ProductController } from './product.controller';
import { Product } from './entities/product.entity';
import { Category } from './entities/category.entity';
import { Banner } from './entities/banner.entity';
import { HomeSection } from './entities/home-section.entity';
import { HomeSectionItem } from './entities/home-section-item.entity';
import { Announcement } from './entities/announcement.entity';
import { HomeLayout } from './entities/home-layout.entity';
import { StorefrontController } from './storefront/storefront.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
      validate: createEnvValidator({
        serviceName: 'product-service',
        requiredDbUrl: 'PRODUCT_DB_URL',
      }),
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        url: configService.get<string>('PRODUCT_DB_URL'),
        entities: [Product, Category, Banner, HomeSection, HomeSectionItem, Announcement, HomeLayout],
        synchronize:
          configService.get<string>('NODE_ENV') === 'development' ||
          configService.get<string>('DB_SYNC') === 'true',
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        migrationsRun: configService.get<string>('DB_SYNC') === 'false',
        ssl: configService.get<string>('PRODUCT_DB_URL')?.includes('ssl-mode=REQUIRED')
          ? { rejectUnauthorized: false }
          : false,
      }),

      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([Product, Category, Banner, HomeSection, HomeSectionItem, Announcement, HomeLayout]),
  ],
  controllers: [ProductController, StorefrontController],
  providers: [],
})
export class AppModule {}
