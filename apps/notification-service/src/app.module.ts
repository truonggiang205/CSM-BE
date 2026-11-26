import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { createEnvValidator } from '@csm/config';
import { NotificationController } from './notification.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
      validate: createEnvValidator({
        serviceName: 'notification-service',
      }),
    }),
  ],
  controllers: [NotificationController],
  providers: [],
})
export class AppModule {}
