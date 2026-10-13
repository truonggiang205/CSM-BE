import { IsString, IsNotEmpty, IsNumber, Min, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class AddStockDto {
  @IsString()
  @IsNotEmpty()
  branchId: string;

  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  referenceId?: string;
}

export class StockItemDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsNumber()
  @Min(1)
  quantity: number;
}

export class ReserveStockDto {
  @IsString()
  @IsNotEmpty()
  branchId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockItemDto)
  items: StockItemDto[];

  @IsOptional()
  @IsString()
  referenceId?: string;
}

export class ConfirmDeductStockDto {
  @IsString()
  @IsNotEmpty()
  branchId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockItemDto)
  items: StockItemDto[];

  @IsOptional()
  @IsString()
  referenceId?: string;
}

export class ReleaseStockDto {
  @IsString()
  @IsNotEmpty()
  branchId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockItemDto)
  items: StockItemDto[];

  @IsOptional()
  @IsString()
  referenceId?: string;
}
