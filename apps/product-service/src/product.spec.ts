import { BadRequestException, NotFoundException, ForbiddenException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProductController } from './product.controller';
import { Product } from './entities/product.entity';
import { Category } from './entities/category.entity';
import { RolesGuard } from './guards/roles.guard';
import * as fs from 'fs';
import * as path from 'path';

describe('ProductController & RolesGuard Unit Tests', () => {
  let controller: ProductController;
  let rolesGuard: RolesGuard;
  let reflector: Reflector;
  let mockProductRepo: any;
  let mockCategoryRepo: any;
  const tempTestUploadDir = path.resolve(__dirname, '../test-uploads');

  beforeAll(() => {
    process.env.UPLOAD_DIR = tempTestUploadDir;
  });

  afterAll(() => {
    if (fs.existsSync(tempTestUploadDir)) {
      fs.rmSync(tempTestUploadDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    reflector = new Reflector();
    rolesGuard = new RolesGuard(reflector);

    mockProductRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((dto) => ({ ...dto, id: 'mock-prod-id' })),
      save: jest.fn(async (p) => p),
      update: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    mockCategoryRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((dto) => ({ ...dto, id: 'mock-cat-id' })),
      save: jest.fn(async (c) => c),
      update: jest.fn(),
      delete: jest.fn(),
    };

    controller = new ProductController(mockProductRepo, mockCategoryRepo);
  });

  function createMockExecutionContext(headers: Record<string, string>): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers,
          user: null,
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any;
  }

  // =========================================================================
  // 1. Phân quyền RolesGuard với upload ảnh (Yêu cầu ADMIN, từ chối CUSTOMER -> 403)
  // =========================================================================
  describe('RolesGuard cho Upload Ảnh', () => {
    it('1.1 CUSTOMER gọi endpoint yêu cầu role ADMIN -> Bị từ chối 403 Forbidden', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
      const ctx = createMockExecutionContext({ 'x-user-role': 'CUSTOMER' });
      expect(() => rolesGuard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('1.2 BRANCH_MANAGER gọi endpoint yêu cầu role ADMIN -> Bị từ chối 403 Forbidden', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
      const ctx = createMockExecutionContext({ 'x-user-role': 'BRANCH_MANAGER' });
      expect(() => rolesGuard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('1.3 Header không có role (người dùng chưa xác thực) -> Bị từ chối 403 Forbidden', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
      const ctx = createMockExecutionContext({});
      expect(() => rolesGuard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('1.4 ADMIN gọi endpoint yêu cầu role ADMIN -> Được phép (true)', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
      const ctx = createMockExecutionContext({ 'x-user-role': 'ADMIN' });
      expect(rolesGuard.canActivate(ctx)).toBe(true);
    });
  });

  // =========================================================================
  // 2. Validate Upload Ảnh (Thiếu file, quá lớn > 2MB, sai loại/MIME -> 400)
  // =========================================================================
  describe('Validate Upload Ảnh (POST /products/:id/image)', () => {
    const mockProduct: Product = {
      id: 'prod-uuid-1',
      sku: 'SKU-TEST-1',
      name: 'Nước Tăng Lực',
      description: 'Nước uống giải khát',
      base_price: 15000,
      image_url: null as any,
      category: null as any,
      created_at: new Date(),
      updated_at: new Date(),
    };

    it('2.1 Không gửi file ảnh -> Ném 400 Bad Request', async () => {
      await expect(controller.uploadProductImage('prod-uuid-1', undefined)).rejects.toThrow(
        new BadRequestException('Vui lòng tải lên tệp hình ảnh'),
      );
    });

    it('2.2 Dung lượng ảnh vượt quá 2MB (2.5 MB) -> Ném 400 Bad Request', async () => {
      const largeFile: Express.Multer.File = {
        fieldname: 'image',
        originalname: 'large-photo.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        size: 2.5 * 1024 * 1024,
        buffer: Buffer.alloc(2.5 * 1024 * 1024),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      await expect(controller.uploadProductImage('prod-uuid-1', largeFile)).rejects.toThrow(
        new BadRequestException('Dung lượng ảnh vượt quá 2MB'),
      );
    });

    it('2.3 Tệp sai định dạng mở rộng (.exe, .pdf, .txt) -> Ném 400 Bad Request', async () => {
      const invalidExtFile: Express.Multer.File = {
        fieldname: 'image',
        originalname: 'malicious.exe',
        encoding: '7bit',
        mimetype: 'application/octet-stream',
        size: 1024,
        buffer: Buffer.from('binary-content'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      await expect(controller.uploadProductImage('prod-uuid-1', invalidExtFile)).rejects.toThrow(
        new BadRequestException('Chỉ chấp nhận tệp định dạng JPG, PNG hoặc WEBP'),
      );
    });

    it('2.4 Tệp có đuôi ảnh (.png) nhưng MIME type giả mạo (text/plain) -> Ném 400 Bad Request', async () => {
      const mismatchedMimeFile: Express.Multer.File = {
        fieldname: 'image',
        originalname: 'fake.png',
        encoding: '7bit',
        mimetype: 'text/plain',
        size: 1024,
        buffer: Buffer.from('plain-text-content'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      await expect(controller.uploadProductImage('prod-uuid-1', mismatchedMimeFile)).rejects.toThrow(
        new BadRequestException('Chỉ chấp nhận tệp định dạng JPG, PNG hoặc WEBP'),
      );
    });

    it('2.5 Upload ảnh cho sản phẩm không tồn tại -> Ném 404 Not Found', async () => {
      mockProductRepo.findOne.mockResolvedValue(null);

      const validFile: Express.Multer.File = {
        fieldname: 'image',
        originalname: 'sample.png',
        encoding: '7bit',
        mimetype: 'image/png',
        size: 1024,
        buffer: Buffer.from('valid-png-data'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      await expect(controller.uploadProductImage('non-existent-id', validFile)).rejects.toThrow(
        new NotFoundException('Không tìm thấy sản phẩm'),
      );
    });

    it('2.6 Upload ảnh hợp lệ (PNG, < 2MB, ADMIN) -> Thành công, lưu relative path /uploads/... và lưu file', async () => {
      mockProductRepo.findOne.mockResolvedValue({ ...mockProduct });

      const validFile: Express.Multer.File = {
        fieldname: 'image',
        originalname: 'product-display.png',
        encoding: '7bit',
        mimetype: 'image/png',
        size: 2048,
        buffer: Buffer.from('valid-png-bytes'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      const result = await controller.uploadProductImage('prod-uuid-1', validFile);

      expect(result.success).toBe(true);
      expect(result.image_url).toMatch(/^\/uploads\/[a-f0-9-]+\.png$/);
      expect(mockProductRepo.save).toHaveBeenCalled();

      // Kiểm tra file thực tế được ghi vào thư mục UPLOAD_DIR
      const savedFileName = path.basename(result.image_url);
      const savedFilePath = path.join(tempTestUploadDir, savedFileName);
      expect(fs.existsSync(savedFilePath)).toBe(true);
      expect(fs.readFileSync(savedFilePath).toString()).toBe('valid-png-bytes');
    });

    it('2.7 Upload ảnh hợp lệ định dạng WEBP (< 2MB) -> Thành công, lưu relative path .webp', async () => {
      mockProductRepo.findOne.mockResolvedValue({ ...mockProduct });

      const validWebpFile: Express.Multer.File = {
        fieldname: 'image',
        originalname: 'item.webp',
        encoding: '7bit',
        mimetype: 'image/webp',
        size: 3072,
        buffer: Buffer.from('webp-binary-data'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      const result = await controller.uploadProductImage('prod-uuid-1', validWebpFile);

      expect(result.success).toBe(true);
      expect(result.image_url).toMatch(/^\/uploads\/[a-f0-9-]+\.webp$/);
    });
  });

  // =========================================================================
  // 3. Chống Path Traversal và phục vụ ảnh (GET /uploads/:filename)
  // =========================================================================
  describe('Chặn Path Traversal & Phục vụ ảnh (GET /uploads/:filename)', () => {
    const mockRes: any = {
      sendFile: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    it('3.1 Filename chứa ký tự path traversal (..) -> Ném 400 Bad Request', async () => {
      await expect(controller.getUploadedFile('../../../etc/passwd', mockRes)).rejects.toThrow(
        new BadRequestException('Phát hiện path traversal không hợp lệ'),
      );
    });

    it('3.2 Filename chứa đường dẫn phân cách (/) -> Ném 400 Bad Request', async () => {
      await expect(controller.getUploadedFile('sub/image.jpg', mockRes)).rejects.toThrow(
        new BadRequestException('Phát hiện path traversal không hợp lệ'),
      );
    });

    it('3.3 Filename chứa ký tự mã hoá URL (%2e%2e) -> Ném 400 Bad Request', async () => {
      await expect(controller.getUploadedFile('%2e%2e%2fsecret.png', mockRes)).rejects.toThrow(
        new BadRequestException('Phát hiện path traversal không hợp lệ'),
      );
    });

    it('3.4 Tệp không tồn tại trong thư mục uploads -> Ném 404 Not Found', async () => {
      await expect(controller.getUploadedFile('non-existent-image-12345.jpg', mockRes)).rejects.toThrow(
        new NotFoundException('Không tìm thấy tệp ảnh'),
      );
    });

    it('3.5 Tệp tồn tại hợp lệ -> Gọi res.sendFile an toàn', async () => {
      const testFileName = 'safe-test-file.jpg';
      const testFilePath = path.join(tempTestUploadDir, testFileName);
      if (!fs.existsSync(tempTestUploadDir)) {
        fs.mkdirSync(tempTestUploadDir, { recursive: true });
      }
      fs.writeFileSync(testFilePath, 'dummy-image-content');

      await controller.getUploadedFile(testFileName, mockRes);
      expect(mockRes.sendFile).toHaveBeenCalledWith(testFilePath);
    });
  });

  // =========================================================================
  // 4. Validate Tìm kiếm & Lọc Sản phẩm (GET /products)
  // =========================================================================
  describe('Tìm kiếm & Lọc Sản Phẩm (GET /products)', () => {
    it('4.1 minPrice lớn hơn maxPrice -> Ném 400 Bad Request', async () => {
      await expect(
        controller.getAllProducts({
          minPrice: 50000,
          maxPrice: 20000,
        }),
      ).rejects.toThrow(new BadRequestException('minPrice không được lớn hơn maxPrice'));
    });

    it('4.2 Tham số tìm kiếm hợp lệ -> Xây dựng TypeORM QueryBuilder và trả chuẩn { items, total, page, limit, totalPages }', async () => {
      const mockItems = [
        { id: 'p1', name: 'Bánh Mì Pate', base_price: 25000 },
        { id: 'p2', name: 'Bánh Mì Thịt Nguội', base_price: 30000 },
      ];
      const mockQb: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([mockItems, 15]),
      };
      mockProductRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await controller.getAllProducts({
        q: 'Bánh Mì',
        categoryId: 'cat-01',
        minPrice: 10000,
        maxPrice: 50000,
        sort: 'price_asc',
        page: 2,
        limit: 5,
      });

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        '(product.name LIKE :searchTerm OR product.sku LIKE :searchTerm)',
        { searchTerm: '%Bánh Mì%' },
      );
      expect(mockQb.andWhere).toHaveBeenCalledWith('product.category_id = :categoryId', { categoryId: 'cat-01' });
      expect(mockQb.andWhere).toHaveBeenCalledWith('product.base_price >= :minPrice', { minPrice: 10000 });
      expect(mockQb.andWhere).toHaveBeenCalledWith('product.base_price <= :maxPrice', { maxPrice: 50000 });
      expect(mockQb.orderBy).toHaveBeenCalledWith('product.base_price', 'ASC');
      expect(mockQb.skip).toHaveBeenCalledWith(5); // (page 2 - 1) * limit 5 = 5
      expect(mockQb.take).toHaveBeenCalledWith(5);

      expect(result).toEqual({
        items: mockItems,
        total: 15,
        page: 2,
        limit: 5,
        totalPages: 3, // Math.ceil(15 / 5) = 3
      });
    });

    it('4.3 Danh sách trống (total = 0) -> totalPages = 0', async () => {
      const mockQb: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      mockProductRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await controller.getAllProducts({});
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });
  });
});
