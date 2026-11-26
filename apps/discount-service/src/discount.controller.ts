import { Controller, Get, Post, Body, Param, Patch, Delete, Query, Req, ForbiddenException } from '@nestjs/common';
import { requireEnv } from '@csm/config';
import { DiscountService } from './discount.service';
import { ValidateVoucherDto } from './dto/validate-voucher.dto';
import { CreateVoucherDto } from './dto/create-voucher.dto';
import { CreateFlashSaleDto } from './dto/create-flash-sale.dto';
import { UpdateFlashSaleDto } from './dto/update-flash-sale.dto';
import { CreateComboDto } from './dto/create-combo.dto';
import { UpdateComboDto } from './dto/update-combo.dto';
import { CreateGiftPromotionDto } from './dto/create-gift-promotion.dto';

const getInternalSecret = () => requireEnv('INTERNAL_SECRET');

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

  @Get(['flash-sales', 'discounts/flash-sales'])
  getAllFlashSales() {
    return this.discountService.getAllFlashSales();
  }

  @Get(['flash-sales/current', 'discounts/flash-sales/current'])
  getActiveOrUpcomingFlashSale() {
    return this.discountService.getActiveOrUpcomingFlashSale();
  }

  @Get(['today-deals', 'discounts/today-deals'])
  getTodayDeals() {
    return this.discountService.getTodayDeals();
  }

  @Get(['flash-sales/:id', 'discounts/flash-sales/:id'])
  getFlashSaleById(@Param('id') id: string) {
    return this.discountService.getFlashSaleById(id);
  }

  @Post(['flash-sales', 'discounts/flash-sales'])
  createFlashSale(@Body() dto: CreateFlashSaleDto) {
    return this.discountService.createFlashSale(dto);
  }

  @Patch(['flash-sales/:id', 'discounts/flash-sales/:id'])
  updateFlashSale(@Param('id') id: string, @Body() dto: UpdateFlashSaleDto) {
    return this.discountService.updateFlashSale(id, dto);
  }

  @Patch(['flash-sales/:id/toggle', 'discounts/flash-sales/:id/toggle'])
  toggleFlashSale(@Param('id') id: string) {
    return this.discountService.toggleFlashSale(id);
  }

  @Delete(['flash-sales/:id', 'discounts/flash-sales/:id'])
  deleteFlashSale(@Param('id') id: string) {
    return this.discountService.deleteFlashSale(id);
  }

  @Post(['flash-sales/record-purchase', 'discounts/flash-sales/record-purchase'])
  recordFlashSalePurchases(@Body('items') items: Array<{ productId: string; quantity: number }>) {
    return this.discountService.recordFlashSalePurchases(items || []);
  }

  @Post(['flash-sales/rollback-purchase', 'discounts/flash-sales/rollback-purchase'])
  rollbackFlashSalePurchases(@Body('items') items: Array<{ productId: string; quantity: number }>) {
    return this.discountService.rollbackFlashSalePurchases(items || []);
  }

  // ==================== COMBO & BUNDLE DEALS ====================

  @Get(['combos', 'discounts/combos'])
  getCombos(@Query('all') all?: string) {
    if (all === 'true') {
      return this.discountService.getAllCombos();
    }
    return this.discountService.getPublicCombos();
  }

  @Get(['combos/:id', 'discounts/combos/:id'])
  getComboById(@Param('id') id: string) {
    return this.discountService.getComboById(id);
  }

  @Post(['combos', 'discounts/combos'])
  createCombo(@Body() dto: CreateComboDto) {
    return this.discountService.createCombo(dto);
  }

  @Patch(['combos/:id', 'discounts/combos/:id'])
  updateCombo(@Param('id') id: string, @Body() dto: UpdateComboDto) {
    return this.discountService.updateCombo(id, dto);
  }

  @Patch(['combos/:id/toggle', 'discounts/combos/:id/toggle'])
  toggleCombo(@Param('id') id: string) {
    return this.discountService.toggleCombo(id);
  }

  @Delete(['combos/:id', 'discounts/combos/:id'])
  deleteCombo(@Param('id') id: string) {
    return this.discountService.deleteCombo(id);
  }

  @Post(['combos/record-purchase', 'discounts/combos/record-purchase'])
  recordComboPurchases(@Body('combos') combos: Array<{ comboId: string; quantity: number }>) {
    return this.discountService.recordComboPurchases(combos || []);
  }

  @Post(['combos/rollback-purchase', 'discounts/combos/rollback-purchase'])
  rollbackComboPurchases(@Body('combos') combos: Array<{ comboId: string; quantity: number }>) {
    return this.discountService.rollbackComboPurchases(combos || []);
  }

  // ==================== BUY X GET Y / GIFT PROMOTIONS ====================

  @Get(['gift-promotions', 'discounts/gift-promotions'])
  getGiftPromotions(@Query('all') all?: string) {
    if (all === 'true') {
      return this.discountService.getAllGiftPromotions();
    }
    return this.discountService.getPublicGiftPromotions();
  }

  @Post(['gift-promotions', 'discounts/gift-promotions'])
  createGiftPromotion(@Body() dto: CreateGiftPromotionDto) {
    return this.discountService.createGiftPromotion(dto);
  }

  @Patch(['gift-promotions/:id/toggle', 'discounts/gift-promotions/:id/toggle'])
  toggleGiftPromotion(@Param('id') id: string) {
    return this.discountService.toggleGiftPromotion(id);
  }

  @Delete(['gift-promotions/:id', 'discounts/gift-promotions/:id'])
  deleteGiftPromotion(@Param('id') id: string) {
    return this.discountService.deleteGiftPromotion(id);
  }

  @Post(['gift-promotions/evaluate', 'discounts/gift-promotions/evaluate'])
  evaluateGiftPromotions(
    @Body('items') items: Array<{ productId: string; quantity: number }>,
    @Body('subtotal') subtotal: number,
  ) {
    return this.discountService.evaluateGiftPromotions(items || [], Number(subtotal) || 0);
  }

  // ==================== SPIN WHEEL ====================

  @Get(['spin-wheel/status', 'discounts/spin-wheel/status'])
  getSpinStatus(@Query('userId') userId?: string, @Req() req?: any) {
    const resolvedUserId = req?.headers?.['x-user-id'] || userId;
    return this.discountService.getSpinStatus(resolvedUserId);
  }

  @Post(['spin-wheel/spin', 'discounts/spin-wheel/spin'])
  spinWheel(@Body('userId') userId?: string, @Req() req?: any) {
    const resolvedUserId = req?.headers?.['x-user-id'] || userId;
    return this.discountService.spinWheel(resolvedUserId);
  }
}
