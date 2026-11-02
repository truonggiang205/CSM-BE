import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  NotFoundException,
  BadRequestException,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
  UseFilters,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Product } from './entities/product.entity';
import { Category } from './entities/category.entity';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { MulterExceptionFilter } from './filters/multer-exception.filter';

@Controller()
@UseGuards(RolesGuard)
export class ProductController {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
  ) {}

  @Get('health')
  getHealth() {
    return { status: 'ok', service: 'product-service' };
  }

  // --- CATEGORY CRUD ---

  @Get('categories')
  async getAllCategories() {
    return this.categoryRepository.find();
  }

  @Roles('ADMIN')
  @Post('categories')
  async createCategory(@Body() body: CreateCategoryDto) {
    const category = this.categoryRepository.create(body);
    return this.categoryRepository.save(category);
  }

  @Roles('ADMIN')
  @Put('categories/:id')
  async updateCategory(@Param('id') id: string, @Body() body: UpdateCategoryDto) {
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
  async getAllProducts(@Query() query: QueryProductDto) {
    if (
      query.minPrice !== undefined &&
      query.maxPrice !== undefined &&
      Number(query.minPrice) > Number(query.maxPrice)
    ) {
      throw new BadRequestException('minPrice không được lớn hơn maxPrice');
    }

    const page = query.page && Number(query.page) >= 1 ? Number(query.page) : 1;
    const limit = query.limit && Number(query.limit) >= 1 ? Number(query.limit) : 10;
    const skip = (page - 1) * limit;

    const qb = this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category');

    if (query.q && query.q.trim()) {
      const searchTerm = `%${query.q.trim()}%`;
      qb.andWhere('(product.name LIKE :searchTerm OR product.sku LIKE :searchTerm)', { searchTerm });
    }

    if (query.categoryId && query.categoryId.trim()) {
      qb.andWhere('product.category_id = :categoryId', { categoryId: query.categoryId.trim() });
    }

    if (query.minPrice !== undefined) {
      qb.andWhere('product.base_price >= :minPrice', { minPrice: Number(query.minPrice) });
    }

    if (query.maxPrice !== undefined) {
      qb.andWhere('product.base_price <= :maxPrice', { maxPrice: Number(query.maxPrice) });
    }

    if (query.sort === 'price_asc') {
      qb.orderBy('product.base_price', 'ASC');
      qb.addOrderBy('product.created_at', 'DESC');
    } else if (query.sort === 'price_desc') {
      qb.orderBy('product.base_price', 'DESC');
      qb.addOrderBy('product.created_at', 'DESC');
    } else if (query.sort === 'name') {
      qb.orderBy('product.name', 'ASC');
      qb.addOrderBy('product.created_at', 'DESC');
    } else {
      qb.orderBy('product.created_at', 'DESC');
    }

    qb.skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();
    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

    return {
      items,
      total,
      page,
      limit,
      totalPages,
    };
  }

  @Get('products/:id')
  async getProductById(@Param('id') id: string) {
    const product = await this.productRepository.findOne({
      where: { id },
      relations: ['category'],
    });
    if (!product) {
      throw new NotFoundException('Không tìm thấy sản phẩm');
    }
    return product;
  }

  @Roles('ADMIN')
  @Post('products')
  async createProduct(@Body() body: CreateProductDto) {
    let category: Category | null = null;
    if (body.category_id) {
      category = await this.categoryRepository.findOne({ where: { id: body.category_id } });
      if (!category) throw new NotFoundException('Không tìm thấy danh mục');
    }

    const product = this.productRepository.create({
      ...body,
      category: category || undefined,
    });
    return this.productRepository.save(product);
  }

  @Roles('ADMIN')
  @Put('products/:id')
  async updateProduct(@Param('id') id: string, @Body() body: UpdateProductDto) {
    const product = await this.productRepository.findOne({ where: { id } });
    if (!product) {
      throw new NotFoundException('Không tìm thấy sản phẩm');
    }

    if (body.category_id !== undefined) {
      if (body.category_id === null || body.category_id === '') {
        (product as any).category = null;
      } else {
        const category = await this.categoryRepository.findOne({ where: { id: body.category_id } });
        if (!category) throw new NotFoundException('Không tìm thấy danh mục');
        product.category = category;
      }
    }

    if (body.name !== undefined) product.name = body.name;
    if (body.description !== undefined) product.description = body.description;
    if (body.base_price !== undefined) product.base_price = body.base_price;
    if (body.image_url !== undefined) product.image_url = body.image_url;

    return this.productRepository.save(product);
  }

  @Roles('ADMIN')
  @Post('products/:id/image')
  @UseFilters(MulterExceptionFilter)
  @UseInterceptors(
    FileInterceptor('image', {
      limits: {
        fileSize: 2 * 1024 * 1024, // 2MB
      },
    }),
  )
  async uploadProductImage(
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Vui lòng tải lên tệp hình ảnh');
    }

    if (file.size > 2 * 1024 * 1024) {
      throw new BadRequestException('Dung lượng ảnh vượt quá 2MB');
    }

    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];

    const ext = path.extname(file.originalname || '').toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();

    if (!allowedExtensions.includes(ext) || !allowedMimeTypes.includes(mime)) {
      throw new BadRequestException('Chỉ chấp nhận tệp định dạng JPG, PNG hoặc WEBP');
    }

    if ((ext === '.jpg' || ext === '.jpeg') && mime !== 'image/jpeg') {
      throw new BadRequestException('Chỉ chấp nhận tệp định dạng JPG, PNG hoặc WEBP');
    }
    if (ext === '.png' && mime !== 'image/png') {
      throw new BadRequestException('Chỉ chấp nhận tệp định dạng JPG, PNG hoặc WEBP');
    }
    if (ext === '.webp' && mime !== 'image/webp') {
      throw new BadRequestException('Chỉ chấp nhận tệp định dạng JPG, PNG hoặc WEBP');
    }

    const product = await this.productRepository.findOne({ where: { id } });
    if (!product) {
      throw new NotFoundException('Không tìm thấy sản phẩm');
    }

    const normalizedExt = ext === '.jpeg' ? '.jpg' : ext;
    const randomFilename = `${crypto.randomUUID()}${normalizedExt}`;

    const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads'));
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const targetFilePath = path.resolve(uploadDir, randomFilename);
    if (!targetFilePath.startsWith(uploadDir + path.sep)) {
      throw new BadRequestException('Đường dẫn lưu tệp không hợp lệ');
    }

    await fs.promises.writeFile(targetFilePath, file.buffer);

    const relativeUrl = `/uploads/${randomFilename}`;
    product.image_url = relativeUrl;
    await this.productRepository.save(product);

    return {
      success: true,
      message: 'Tải lên ảnh sản phẩm thành công',
      image_url: relativeUrl,
      product,
    };
  }

  @Get('uploads/:filename')
  async getUploadedFile(@Param('filename') filename: string, @Res() res: Response) {
    if (
      !filename ||
      filename.includes('..') ||
      filename.includes('/') ||
      filename.includes('\\') ||
      filename.includes('%')
    ) {
      throw new BadRequestException('Phát hiện path traversal không hợp lệ');
    }

    const safeFilename = path.basename(filename);
    if (filename !== safeFilename) {
      throw new BadRequestException('Phát hiện path traversal không hợp lệ');
    }

    const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads'));
    const safePath = path.resolve(uploadDir, safeFilename);

    if (!safePath.startsWith(uploadDir + path.sep)) {
      throw new BadRequestException('Phát hiện path traversal không hợp lệ');
    }

    if (!fs.existsSync(safePath)) {
      throw new NotFoundException('Không tìm thấy tệp ảnh');
    }

    return res.sendFile(safePath);
  }

  @Roles('ADMIN')
  @Delete('products/:id')
  async deleteProduct(@Param('id') id: string) {
    await this.productRepository.delete(id);
    return { success: true, message: 'Xóa sản phẩm thành công' };
  }
}
