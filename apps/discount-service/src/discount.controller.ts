import { Controller, Get, Post, Body, Param, Patch, Query, Req, ForbiddenException } from '@nestjs/common';
import { DiscountService } from './discount.service';
import { ValidateVoucherDto } from './dto/validate-voucher.dto';
import { CreateVoucherDto } from './dto/create-voucher.dto';

const getInternalSecret = () => process.env.INTERNAL_SECRET || 'csm-super-secure-internal-secret-token';

@Controller()
export class DiscountController {
  constructor(private readonly discountService: DiscountService) {}

  @Get(['health', 'discounts/health'])
  getHealth() {
    return { status: 'ok', service: 'discount-service' };
  }

  @Get(['vouchers', 'discounts/vouchers'])
  async getVouchers(
    @Query('all') all?: string,
    @Query('userId') userId?: string,
    @Req() req?: any,
  ) {
    if (all === 'true') {
      const role = req?.headers?.['x-user-role'];
      if (role !== 'ADMIN') {
        throw new ForbiddenException('Chỉ ADMIN mới có quyền xem toàn bộ danh sách voucher');
      }
      return this.discountService.getAllVouchers();
    }
    const resolvedUserId = userId || req?.headers?.['x-user-id'];
    return this.discountService.getPublicVouchers(resolvedUserId);
  }

  @Get(['vouchers/:id/usages', 'discounts/vouchers/:id/usages'])
  async getVoucherUsages(@Param('id') id: string, @Req() req?: any) {
    const role = req?.headers?.['x-user-role'];
    if (role !== 'ADMIN') {
      throw new ForbiddenException('Chỉ ADMIN mới có quyền xem lịch sử sử dụng voucher');
    }
    return this.discountService.getVoucherUsages(id);
  }

  @Post(['vouchers/validate', 'discounts/vouchers/validate'])
  async validateVoucher(@Body() dto: ValidateVoucherDto) {
    return this.discountService.validateVoucher(
      dto.code,
      dto.orderValue,
      dto.userId,
      dto.shippingFee,
    );
  }

  @Post(['vouchers/claim', 'discounts/vouchers/claim'])
  async claimVoucher(
    @Body('code') code: string,
    @Body('userId') userId?: string,
    @Body('orderId') orderId?: string,
    @Req() req?: any,
  ) {
    const isInternal = req?.headers?.['x-internal-secret'] === getInternalSecret();
    if (!isInternal && req?.headers?.['x-user-role'] !== 'ADMIN') {
      throw new ForbiddenException('Endpoint chỉ cho phép gọi nội bộ hoặc ADMIN');
    }
    const result = await this.discountService.claimVoucher(code, userId, orderId);

    // Chỉ bật hook mô phỏng trễ khi ENABLE_TEST_DELAY === 'true' (mặc định tắt ở production/dev)
    if (process.env.ENABLE_TEST_DELAY === 'true') {
      const delayMs = req?.headers?.['x-simulate-delay-ms']
        ? parseInt(req.headers['x-simulate-delay-ms'], 10)
        : (code && code.includes('TIMEOUT') ? 5500 : 0);

      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return result;
  }

  @Post(['vouchers/release', 'discounts/vouchers/release'])
  async releaseVoucher(
    @Body('code') code: string,
    @Body('userId') userId?: string,
    @Body('orderId') orderId?: string,
    @Req() req?: any,
  ) {
    const isInternal = req?.headers?.['x-internal-secret'] === getInternalSecret();
    if (!isInternal && req?.headers?.['x-user-role'] !== 'ADMIN') {
      throw new ForbiddenException('Endpoint chỉ cho phép gọi nội bộ hoặc ADMIN');
    }
    return this.discountService.releaseVoucher(code, userId, orderId);
  }

  @Post(['vouchers', 'discounts/vouchers'])
  async createVoucher(@Body() dto: CreateVoucherDto, @Req() req?: any) {
    const role = req?.headers?.['x-user-role'];
    if (role !== 'ADMIN') {
      throw new ForbiddenException('Chỉ ADMIN mới có quyền tạo voucher');
    }
    return this.discountService.createVoucher(dto);
  }

  @Patch(['vouchers/:id/toggle', 'discounts/vouchers/:id/toggle'])
  async toggleVoucher(@Param('id') id: string, @Req() req?: any) {
    const role = req?.headers?.['x-user-role'];
    if (role !== 'ADMIN') {
      throw new ForbiddenException('Chỉ ADMIN mới có quyền bật/tắt voucher');
    }
    return this.discountService.toggleVoucher(id);
  }
}
