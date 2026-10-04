import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Branch } from './entities/branch.entity';

@Controller('branches')
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

  @Get(':id')
  async getBranchById(@Param('id') id: string): Promise<Branch> {
    const branch = await this.branchRepository.findOne({ where: { id } });
    if (!branch) {
      throw new NotFoundException(`Không tìm thấy chi nhánh với ID: ${id}`);
    }
    return branch;
  }
}
