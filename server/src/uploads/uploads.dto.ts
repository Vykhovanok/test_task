import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UploadImageDto {
  @ApiPropertyOptional({ example: 'folder-resource-id', nullable: true })
  @IsOptional()
  @IsString()
  parentId?: string | null;
}
