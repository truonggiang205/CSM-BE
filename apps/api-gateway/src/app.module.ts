import { Module } from '@nestjs/common';
import { ProxyController } from './proxy.controller';

@Module({
  imports: [],
  controllers: [ProxyController],
  providers: [],
})
export class AppModule {}
