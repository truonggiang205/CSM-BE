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
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Branch } from './entities/branch.entity';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';

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
  ) {}

  @Get()
  async getAllBranches(): Promise<Branch[]> {
    return this.branchRepository.find({
      order: { name: 'ASC' },
    });
  }

  // TÌM CHI NHÁNH GẦN NHẤT THEO TOẠ ĐỘ GPS (CÔNG THỨC HAVERSINE)
  // Lưu ý: Endpoint 'nearest' phải đặt TRƯỚC ':id' để tránh bị NestJS nhầm thành param id
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
      // Nếu chưa có chi nhánh nào có toạ độ, trả về chi nhánh đầu tiên
      const firstBranch = branches[0];
      if (!firstBranch) {
        throw new NotFoundException('Hệ thống hiện chưa có chi nhánh nào');
      }
      return {
        ...firstBranch,
        distance_km: null,
      };
    }

    // Tính khoảng cách Haversine tới từng chi nhánh
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
    const branch = this.branchRepository.create(dto);
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

  // XOÁ CHI NHÁNH (CHỈ ADMIN)
  @Roles('ADMIN')
  @Delete(':id')
  async deleteBranch(@Param('id') id: string) {
    const existing = await this.branchRepository.findOne({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Không tìm thấy chi nhánh với ID: ${id}`);
    }

    await this.branchRepository.delete(id);
    return {
      success: true,
      message: `Đã xoá chi nhánh ${id} (${existing.name}) thành công`,
    };
  }
}
