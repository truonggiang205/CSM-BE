import { Controller, Get, Post, Body, Param, Patch, Query, Req } from '@nestjs/common';
import { DiscountService } from './discount.service';
import { ValidateVoucherDto } from './dto/validate-voucher.dto';
import { CreateVoucherDto } from './dto/create-voucher.dto';

@Controller()
export class DiscountController {
  constructor(private readonly discountService: DiscountService) {}

  @Get(['health', 'discounts/health'])
  getHealth() {
    return { status: 'ok', service: 'discount-service' };
  }

  @Get(['vouchers', 'discounts/vouchers'])
  getVouchers(
    @Query('all') all?: string,
    @Query('userId') userId?: string,
    @Req() req?: any,
  ) {
    if (all === 'true') {
      return this.discountService.getAllVouchers();
    }
    const resolvedUserId = userId || req?.headers?.['x-user-id'];
    return this.discountService.getPublicVouchers(resolvedUserId);
  }

  @Get(['vouchers/:id/usages', 'discounts/vouchers/:id/usages'])
  getVoucherUsages(@Param('id') id: string) {
    return this.discountService.getVoucherUsages(id);
  }

  @Post(['vouchers/validate', 'discounts/vouchers/validate'])
  validateVoucher(@Body() dto: ValidateVoucherDto) {
    return this.discountService.validateVoucher(
      dto.code,
      dto.orderValue,
      dto.userId,
      dto.shippingFee,
    );
  }

  @Post(['vouchers/claim', 'discounts/vouchers/claim'])
  claimVoucher(
    @Body('code') code: string,
    @Body('userId') userId?: string,
    @Body('orderId') orderId?: string,
  ) {
    return this.discountService.claimVoucher(code, userId, orderId);
  }

  @Post(['vouchers/release', 'discounts/vouchers/release'])
  releaseVoucher(
    @Body('code') code: string,
    @Body('userId') userId?: string,
    @Body('orderId') orderId?: string,
  ) {
    return this.discountService.releaseVoucher(code, userId, orderId);
  }

  @Post(['vouchers', 'discounts/vouchers'])
  createVoucher(@Body() dto: CreateVoucherDto) {
    return this.discountService.createVoucher(dto);
  }

  @Patch(['vouchers/:id/toggle', 'discounts/vouchers/:id/toggle'])
  toggleVoucher(@Param('id') id: string) {
    return this.discountService.toggleVoucher(id);
  }
}
