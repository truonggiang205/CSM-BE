import { Controller, Get, Post, Body, Param, Patch } from '@nestjs/common';
import { DiscountService } from './discount.service';
import { ValidateVoucherDto } from './dto/validate-voucher.dto';
import { CreateVoucherDto } from './dto/create-voucher.dto';

@Controller('discounts')
export class DiscountController {
  constructor(private readonly discountService: DiscountService) {}

  @Get('health')
  getHealth() {
    return { status: 'ok', service: 'discount-service' };
  }

  @Get('vouchers')
  getPublicVouchers() {
    return this.discountService.getPublicVouchers();
  }

  @Post('vouchers/validate')
  validateVoucher(@Body() dto: ValidateVoucherDto) {
    return this.discountService.validateVoucher(dto.code, dto.orderValue);
  }

  @Post('vouchers/claim')
  claimVoucher(@Body('code') code: string) {
    return this.discountService.claimVoucher(code);
  }

  @Post('vouchers')
  createVoucher(@Body() dto: CreateVoucherDto) {
    return this.discountService.createVoucher(dto);
  }

  @Patch('vouchers/:id/toggle')
  toggleVoucher(@Param('id') id: string) {
    return this.discountService.toggleVoucher(id);
  }
}