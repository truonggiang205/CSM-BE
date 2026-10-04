import { Controller, Get, Post, Put, Delete, Param, Body, NotFoundException, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { Category } from './entities/category.entity';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';

@Controller()
@UseGuards(RolesGuard)
export class ProductController {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
  ) {}

  // --- CATEGORY CRUD ---

  @Get('categories')
  async getAllCategories() {
    return this.categoryRepository.find();
  }

  @Roles('ADMIN')
  @Post('categories')
  async createCategory(@Body() body: { name: string; description?: string }) {
    const category = this.categoryRepository.create(body);
    return this.categoryRepository.save(category);
  }

  @Roles('ADMIN')
  @Put('categories/:id')
  async updateCategory(@Param('id') id: string, @Body() body: { name?: string; description?: string }) {
    await this.categoryRepository.update(id, body);
    return this.categoryRepository.findOne({ where: { id } });
  }

  @Roles('ADMIN')
  @Delete('categories/:id')
  async deleteCategory(@Param('id') id: string) {
    await this.categoryRepository.delete(id);
    return { success: true, message: 'Xóa danh mục thành công' };
  }

  // --- PRODUCT CRUD ---

  @Get('products')
  async getAllProducts() {
    return this.productRepository.find({ relations: ['category'] });
  }

  @Get('products/:id')
  async getProductById(@Param('id') id: string) {
    const product = await this.productRepository.findOne({ 
      where: { id },
      relations: ['category']
    });
    if (!product) {
      throw new NotFoundException('Không tìm thấy sản phẩm');
    }
    return product;
  }

  @Roles('ADMIN')
  @Post('products')
  async createProduct(@Body() body: { sku: string; name: string; description?: string; base_price: number; image_url?: string; category_id?: string }) {
    let category = null;
    if (body.category_id) {
      category = await this.categoryRepository.findOne({ where: { id: body.category_id } });
      if (!category) throw new NotFoundException('Không tìm thấy danh mục');
    }

    const product = this.productRepository.create({
      ...body,
      category,
    });
    return this.productRepository.save(product);
  }

  @Roles('ADMIN')
  @Put('products/:id')
  async updateProduct(@Param('id') id: string, @Body() body: { sku?: string; name?: string; description?: string; base_price?: number; image_url?: string; category_id?: string | null }) {
    const product = await this.productRepository.findOne({ where: { id } });
    if (!product) {
      throw new NotFoundException('Không tìm thấy sản phẩm');
    }

    if (body.category_id !== undefined) {
      if (body.category_id === null) {
        product.category = null;
      } else {
        const category = await this.categoryRepository.findOne({ where: { id: body.category_id } });
        if (!category) throw new NotFoundException('Không tìm thấy danh mục');
        product.category = category;
      }
    }

    if (body.sku !== undefined) product.sku = body.sku;
    if (body.name !== undefined) product.name = body.name;
    if (body.description !== undefined) product.description = body.description;
    if (body.base_price !== undefined) product.base_price = body.base_price;
    if (body.image_url !== undefined) product.image_url = body.image_url;

    return this.productRepository.save(product);
  }

  @Roles('ADMIN')
  @Delete('products/:id')
  async deleteProduct(@Param('id') id: string) {
    await this.productRepository.delete(id);
    return { success: true, message: 'Xóa sản phẩm thành công' };
  }
}
