import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiscountController } from './discount.controller';
import { DiscountService } from './discount.service';
import { Voucher } from './entities/voucher.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        url: config.get<string>('DISCOUNT_DB_URL') || 'mysql://root:rootpassword@localhost:3306/csm_discount',
        entities: [Voucher],
        synchronize: true,
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([Voucher]),
  ],
  controllers: [DiscountController],
  providers: [DiscountService],
})
export class AppModule {}