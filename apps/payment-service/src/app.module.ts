import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { createEnvValidator } from '@csm/config';
import { PaymentController } from './payment.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
      validate: createEnvValidator({
        serviceName: 'payment-service',
        requiredSecrets: ['JWT_SECRET', 'INTERNAL_SECRET'],
        conditionalSecrets: [
          {
            key: 'PAYMENT_SIMULATION_SECRET',
            reason: 'PAYMENT_SIMULATION=true',
            when: (cfg) => cfg.PAYMENT_SIMULATION === 'true',
          },
        ],
      }),
    }),
  ],
  controllers: [PaymentController],
  providers: [],
})
export class AppModule {}
