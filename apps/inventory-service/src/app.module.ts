import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryController } from './inventory.controller';
import { Branch } from './entities/branch.entity';
import { Stock } from './entities/stock.entity';
import { StockTransaction } from './entities/stock-transaction.entity';

import { BranchController } from './branch.controller';

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
        url: configService.get<string>('INVENTORY_DB_URL'),
        entities: [Branch, Stock, StockTransaction],
        synchronize:
          configService.get<string>('NODE_ENV') === 'development' ||
          configService.get<string>('DB_SYNC') === 'true',
        ssl: configService.get<string>('INVENTORY_DB_URL')?.includes('ssl-mode=REQUIRED')
          ? { rejectUnauthorized: false }
          : false,
      }),

      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([Branch, Stock, StockTransaction]),
  ],
  controllers: [InventoryController, BranchController],
  providers: [],
})
export class AppModule {}
