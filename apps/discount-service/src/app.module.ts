import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createEnvValidator } from '@csm/config';
import { DiscountController } from './discount.controller';
import { DiscountService } from './discount.service';
import { Voucher } from './entities/voucher.entity';
import { VoucherUsage } from './entities/voucher-usage.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
      validate: createEnvValidator({
        serviceName: 'discount-service',
        requiredDbUrl: 'DISCOUNT_DB_URL',
        requiredSecrets: ['INTERNAL_SECRET'],
      }),
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        url: config.getOrThrow<string>('DISCOUNT_DB_URL'),
        entities: [Voucher, VoucherUsage],
        synchronize:
          config.get<string>('NODE_ENV') === 'development' ||
          config.get<string>('DB_SYNC') === 'true',
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        migrationsRun: config.get<string>('DB_SYNC') === 'false',
        ssl: config.get<string>('DISCOUNT_DB_URL')?.includes('ssl-mode=REQUIRED')
          ? { rejectUnauthorized: false }
          : false,
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([Voucher, VoucherUsage]),
  ],
  controllers: [DiscountController],
  providers: [DiscountService],
})
export class AppModule {}
