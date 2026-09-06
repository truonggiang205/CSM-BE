import { Controller, Get, Post, Param, Body, BadRequestException } from '@nestjs/common';

// Tồn kho theo từng cặp (branch_id, product_id)
let INVENTORY_DB: Array<{ branchId: number; productId: number; stock: number }> = [
  { branchId: 1, productId: 1, stock: 25 },
  { branchId: 1, productId: 2, stock: 12 },
  { branchId: 1, productId: 3, stock: 8 },
  { branchId: 1, productId: 4, stock: 0 },
  { branchId: 1, productId: 5, stock: 40 },
  { branchId: 2, productId: 1, stock: 10 },
  { branchId: 2, productId: 2, stock: 15 },
  { branchId: 2, productId: 3, stock: 0 },
  { branchId: 3, productId: 1, stock: 30 },
];

@Controller('inventory')
export class InventoryController {
  @Get('branch/:branchId')
  getInventoryByBranch(@Param('branchId') branchId: string) {
    return INVENTORY_DB.filter(item => item.branchId === Number(branchId));
  }

  @Post('check-stock')
  checkStock(@Body() body: { branchId: number; items: Array<{ productId: number; quantity: number }> }) {
    const { branchId, items } = body;
    for (const item of items) {
      const record = INVENTORY_DB.find(inv => inv.branchId === branchId && inv.productId === item.productId);
      if (!record || record.stock < item.quantity) {
        return {
          available: false,
          message: `Sản phẩm ID ${item.productId} không đủ số lượng tại chi nhánh ${branchId}!`,
        };
      }
    }
    return { available: true, message: 'Còn đủ hàng tồn kho' };
  }

  @Post('deduct-stock')
  deductStock(@Body() body: { branchId: number; items: Array<{ productId: number; quantity: number }> }) {
    const { branchId, items } = body;
    // Kiểm tra trước
    for (const item of items) {
      const record = INVENTORY_DB.find(inv => inv.branchId === branchId && inv.productId === item.productId);
      if (!record || record.stock < item.quantity) {
        throw new BadRequestException(`Không đủ tồn kho để trừ sản phẩm ID ${item.productId}`);
      }
    }
    // Thực hiện trừ kho
    for (const item of items) {
      const record = INVENTORY_DB.find(inv => inv.branchId === branchId && inv.productId === item.productId);
      if (record) {
        record.stock -= item.quantity;
      }
    }
    return { success: true, message: 'Đã trừ tồn kho thành công', remaining: INVENTORY_DB };
  }
}
