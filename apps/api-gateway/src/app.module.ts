import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { createEnvValidator } from '@csm/config';
import { ProxyController } from './proxy.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
      validate: createEnvValidator({
        serviceName: 'api-gateway',
        requiredSecrets: ['JWT_SECRET', 'INTERNAL_SECRET'],
      }),
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [ProxyController],
  providers: [],
})
export class AppModule {}
