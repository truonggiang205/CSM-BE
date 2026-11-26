import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiscountController } from './discount.controller';
import { DiscountService } from './discount.service';
import { Voucher } from './entities/voucher.entity';
import { VoucherUsage } from './entities/voucher-usage.entity';
import { FlashSaleCampaign } from './entities/flash-sale-campaign.entity';
import { FlashSaleItem } from './entities/flash-sale-item.entity';
import { Combo } from './entities/combo.entity';
import { ComboItem } from './entities/combo-item.entity';
import { GiftPromotion } from './entities/gift-promotion.entity';
import { SpinHistory } from './entities/spin-history.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        url: config.get<string>('DISCOUNT_DB_URL') || 'mysql://root:rootpassword@localhost:3306/csm_discount',
        entities: [Voucher, VoucherUsage, FlashSaleCampaign, FlashSaleItem, Combo, ComboItem, GiftPromotion, SpinHistory],
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
    TypeOrmModule.forFeature([Voucher, VoucherUsage, FlashSaleCampaign, FlashSaleItem, Combo, ComboItem, GiftPromotion, SpinHistory]),
  ],
  controllers: [DiscountController],
  providers: [DiscountService],
})
export class AppModule {}
