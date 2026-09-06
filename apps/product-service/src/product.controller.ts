import { Controller, Get, Param } from '@nestjs/common';

const BRANCHES = [
  { id: 1, name: 'Chi nhánh Quận 1 (Chợ Bến Thành)', address: '12 Lê Thánh Tôn', district: 'Quận 1', city: 'TP.HCM', phone: '028 3822 1111' },
  { id: 2, name: 'Chi nhánh Bình Thạnh (Hàng Xanh)', address: '254 Xô Viết Nghệ Tĩnh', district: 'Bình Thạnh', city: 'TP.HCM', phone: '028 3899 2222' },
  { id: 3, name: 'Chi nhánh Thủ Đức (Khu ĐHQG)', address: 'Đường A1, P. Linh Trung', district: 'Thủ Đức', city: 'TP.HCM', phone: '028 3724 3333' },
];

const PRODUCTS = [
  { id: 1, categoryId: 1, sku: 'BV-MILK-TEA', name: 'Trà Sữa Trân Châu Hoàng Gia 500ml', price: 35000 },
  { id: 2, categoryId: 1, sku: 'BV-COLD-BREW', name: 'Cà Phê Cold Brew Cam Sả 330ml', price: 42000 },
  { id: 3, categoryId: 2, sku: 'FF-BURGER-BEEF', name: 'Burger Bò Úc Phô Mai Tan Chảy', price: 55000 },
  { id: 4, categoryId: 2, sku: 'FF-SANDWICH-EGG', name: 'Sandwich Trứng Phô Mai Nướng Giòn', price: 28000 },
  { id: 5, categoryId: 3, sku: 'SN-POTATO-CHIPS', name: 'Khoai Tây Sấy Giòn Vị Rong Biển', price: 22000 },
];

@Controller()
export class ProductController {
  @Get('branches')
  getAllBranches() {
    return BRANCHES;
  }

  @Get('branches/:id')
  getBranchById(@Param('id') id: string) {
    return BRANCHES.find(b => b.id === Number(id)) || { message: 'Không tìm thấy chi nhánh' };
  }

  @Get('products')
  getAllProducts() {
    return PRODUCTS;
  }

  @Get('products/:id')
  getProductById(@Param('id') id: string) {
    return PRODUCTS.find(p => p.id === Number(id)) || { message: 'Không tìm thấy sản phẩm' };
  }
}
