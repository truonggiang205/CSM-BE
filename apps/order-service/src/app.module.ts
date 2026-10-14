import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderController } from './order.controller';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { JwtModule } from '@nestjs/jwt';

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
        url: configService.get<string>('ORDER_DB_URL'),
        entities: [Order, OrderItem],
        synchronize:
          configService.get<string>('NODE_ENV') === 'development' ||
          configService.get<string>('DB_SYNC') === 'true',
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        migrationsRun: configService.get<string>('DB_SYNC') === 'false',
        ssl: configService.get<string>('ORDER_DB_URL')?.includes('ssl-mode=REQUIRED')
          ? { rejectUnauthorized: false }
          : false,
      }),

      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([Order, OrderItem]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'csm-super-secret-key-production-change-me',
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [OrderController],
  providers: [],
})
export class AppModule {}
