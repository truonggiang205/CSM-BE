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
  ConflictException,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { Branch } from './entities/branch.entity';
import { Stock } from './entities/stock.entity';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';

const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://localhost:3004';

// Công thức Haversine tính khoảng cách theo đường cong Trái Đất (km)
function calculateHaversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Bán kính Trái Đất theo km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100; // Làm tròn 2 chữ số thập phân
}

@Controller('branches')
@UseGuards(RolesGuard)
export class BranchController {
  constructor(
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @InjectRepository(Stock)
    private readonly stockRepository: Repository<Stock>,
  ) {}

  // LẤY DANH SÁCH CHI NHÁNH ĐANG HOẠT ĐỘNG (is_active = true)
  @Get()
  async getAllBranches(): Promise<Branch[]> {
    return this.branchRepository.find({
      where: { is_active: true },
      order: { name: 'ASC' },
    });
  }

  // TÌM CHI NHÁNH GẦN NHẤT THEO TOẠ ĐỘ GPS (CÔNG THỨC HAVERSINE - CHỈ LẤY is_active = true)
  @Get('nearest')
  async getNearestBranch(
    @Query('lat') latStr?: string,
    @Query('lng') lngStr?: string,
  ) {
    if (!latStr || !lngStr) {
      throw new BadRequestException('Vui lòng cung cấp đầy đủ toạ độ lat và lng');
    }

    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);

    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new BadRequestException('Toạ độ lat/lng không hợp lệ');
    }

    const branches = await this.branchRepository.find({
      where: { is_active: true },
    });

    const branchesWithCoords = branches.filter(
      (b) => b.latitude !== null && b.latitude !== undefined && b.longitude !== null && b.longitude !== undefined,
    );

    if (branchesWithCoords.length === 0) {
      const firstBranch = branches[0];
      if (!firstBranch) {
        throw new NotFoundException('Hệ thống hiện chưa có chi nhánh nào đang hoạt động');
      }
      return {
        ...firstBranch,
        distance_km: null,
      };
    }

    let nearestBranch: Branch = branchesWithCoords[0];
    let minDistance = calculateHaversine(lat, lng, Number(nearestBranch.latitude), Number(nearestBranch.longitude));

    for (let i = 1; i < branchesWithCoords.length; i++) {
      const b = branchesWithCoords[i];
      const dist = calculateHaversine(lat, lng, Number(b.latitude), Number(b.longitude));
      if (dist < minDistance) {
        minDistance = dist;
        nearestBranch = b;
      }
    }

    return {
      ...nearestBranch,
      distance_km: minDistance,
    };
  }

  @Get(':id')
  async getBranchById(@Param('id') id: string): Promise<Branch> {
    const branch = await this.branchRepository.findOne({ where: { id } });
    if (!branch) {
      throw new NotFoundException(`Không tìm thấy chi nhánh với ID: ${id}`);
    }
    return branch;
  }

  // TẠO CHI NHÁNH MỚI (CHỈ ADMIN)
  @Roles('ADMIN')
  @Post()
  async createBranch(@Body() dto: CreateBranchDto): Promise<Branch> {
    const branch = this.branchRepository.create({
      ...dto,
      is_active: dto.is_active !== undefined ? dto.is_active : true,
    });
    return await this.branchRepository.save(branch);
  }

  // CẬP NHẬT CHI NHÁNH (CHỈ ADMIN)
  @Roles('ADMIN')
  @Put(':id')
  async updateBranch(
    @Param('id') id: string,
    @Body() dto: UpdateBranchDto,
  ): Promise<Branch> {
    const existing = await this.branchRepository.findOne({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Không tìm thấy chi nhánh với ID: ${id}`);
    }

    Object.assign(existing, dto);
    return await this.branchRepository.save(existing);
  }

  // XOÁ MỀM CHI NHÁNH (CHỈ ADMIN) - TỪ CHỐI 409 NẾU CÒN TỒN KHO > 0 HOẶC ĐƠN PENDING/CONFIRMED
  @Roles('ADMIN')
  @Delete(':id')
  async deleteBranch(@Param('id') id: string) {
    const existing = await this.branchRepository.findOne({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Không tìm thấy chi nhánh với ID: ${id}`);
    }

    // 1. Kiểm tra tồn kho hàng hoá tại chi nhánh (> 0)
    const branchStocks = await this.stockRepository.find({
      where: { branch_id: id },
    });
    const totalRemainingQty = branchStocks.reduce((sum, s) => sum + (s.quantity || 0), 0);
    if (totalRemainingQty > 0) {
      throw new ConflictException(
        `Không thể xóa chi nhánh còn tồn kho (${totalRemainingQty} sản phẩm). Vui lòng điều chuyển hoặc xuất kho trước khi xóa.`,
      );
    }

    // 2. Kiểm tra đơn hàng đang PENDING hoặc CONFIRMED thuộc chi nhánh này
    try {
      const orderRes = await axios.get(`${ORDER_SERVICE_URL}/orders/branch/${id}/active-count`, {
        timeout: 3000,
      });
      if (orderRes.data && orderRes.data.count > 0) {
        throw new ConflictException(
          `Không thể xóa chi nhánh còn ${orderRes.data.count} đơn hàng đang ở trạng thái PENDING hoặc CONFIRMED.`,
        );
      }
    } catch (err: any) {
      if (err instanceof ConflictException) throw err;
      console.warn(`[InventoryService] Không thể kết nối Order Service để kiểm tra đơn hàng: ${err.message}`);
    }

    // 3. Thực hiện xoá mềm (is_active = false)
    existing.is_active = false;
    await this.branchRepository.save(existing);

    return {
      success: true,
      message: `Đã vô hiệu hoá (xóa mềm) chi nhánh ${id} (${existing.name}) thành công`,
    };
  }
}
