import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createEnvValidator } from '@csm/config';
import { OrderController } from './order.controller';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
      validate: createEnvValidator({
        serviceName: 'order-service',
        requiredDbUrl: 'ORDER_DB_URL',
        requiredSecrets: ['JWT_SECRET', 'INTERNAL_SECRET'],
      }),
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        url: configService.getOrThrow<string>('ORDER_DB_URL'),
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
        secret: configService.getOrThrow<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [OrderController],
  providers: [],
})
export class AppModule {}
