import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';

@Module({
  imports: [],
  controllers: [InventoryController],
  providers: [],
})
export class AppModule {}
