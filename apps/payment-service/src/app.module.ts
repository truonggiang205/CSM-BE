import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';

@Module({
  imports: [],
  controllers: [PaymentController],
  providers: [],
})
export class AppModule {}
