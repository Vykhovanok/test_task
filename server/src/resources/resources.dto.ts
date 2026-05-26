import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PermissionRole,
  ProcessingStatus,
  ResourceType,
  Visibility,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateFolderDto {
  @ApiProperty({ example: 'Documents' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({ example: 'parent-resource-id', nullable: true })
  @IsOptional()
  @IsString()
  parentId?: string | null;
}

export class UpdateResourceDto {
  @ApiPropertyOptional({ example: 'Renamed folder' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ enum: Visibility })
  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;
}

export class ReorderResourceDto {
  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  targetIndex!: number;
}

export class SearchResourcesDto {
  @ApiProperty({ example: 'project' })
  @IsString()
  @IsNotEmpty()
  query!: string;

  @ApiPropertyOptional({ example: 'cursor-id' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ example: 50, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ListChildrenQueryDto {
  @ApiPropertyOptional({ example: 'parent-resource-id', nullable: true })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional({ example: 'cursor-id' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ example: 100, default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class ListFoldersQueryDto {
  @ApiPropertyOptional({ example: 'cursor-id' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ example: 200, default: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @ApiPropertyOptional({
    example: 'resource-id',
    description: 'Exclude this resource and its descendants from results.',
  })
  @IsOptional()
  @IsString()
  excludeSubtreeOf?: string;
}

export class MoveResourceDto {
  @ApiPropertyOptional({ example: 'destination-parent-id', nullable: true })
  @IsOptional()
  @IsString()
  parentId?: string | null;
}

export class ResourceEntityDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ResourceType })
  type!: ResourceType;

  @ApiProperty()
  ownerId!: string;

  @ApiProperty({ nullable: true })
  parentId!: string | null;

  @ApiProperty({ enum: Visibility })
  visibility!: Visibility;

  @ApiProperty({ nullable: true })
  mimeType!: string | null;

  @ApiProperty({ nullable: true })
  originalFilename!: string | null;

  @ApiProperty({
    nullable: true,
    description: 'URL to fetch the original file.',
  })
  fileUrl!: string | null;

  @ApiProperty({
    nullable: true,
    description:
      'URL to fetch the compressed file (available after processing).',
  })
  compressedFileUrl!: string | null;

  @ApiProperty({ nullable: true })
  size!: number | null;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty({ enum: ProcessingStatus, nullable: true })
  processingStatus!: ProcessingStatus | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty({ enum: ['owner', 'editor', 'viewer'] })
  effectiveRole!: 'owner' | 'editor' | 'viewer';

  @ApiProperty()
  inheritedAccess!: boolean;

  @ApiProperty({ enum: PermissionRole, nullable: true })
  permissionRole!: PermissionRole | null;

  @ApiProperty({
    description: 'Number of direct child resources visible to the caller.',
  })
  childCount!: number;
}

export class ResourcePageDto {
  @ApiProperty({ type: () => [ResourceEntityDto] })
  items!: ResourceEntityDto[];

  @ApiProperty({ nullable: true })
  nextCursor!: string | null;

  @ApiProperty()
  hasMore!: boolean;
}

export class FolderPathItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;
}

export class ResourceTreeNodeDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ResourceType })
  type!: ResourceType;

  @ApiProperty()
  ownerId!: string;

  @ApiProperty({ nullable: true })
  parentId!: string | null;

  @ApiProperty({ enum: Visibility })
  visibility!: Visibility;

  @ApiProperty({ nullable: true })
  mimeType!: string | null;

  @ApiProperty({ nullable: true })
  originalFilename!: string | null;

  @ApiProperty({
    nullable: true,
    description: 'URL to fetch the original file.',
  })
  fileUrl!: string | null;

  @ApiProperty({
    nullable: true,
    description:
      'URL to fetch the compressed file (available after processing).',
  })
  compressedFileUrl!: string | null;

  @ApiProperty({ nullable: true })
  size!: number | null;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty({ enum: ProcessingStatus, nullable: true })
  processingStatus!: ProcessingStatus | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty({ enum: ['owner', 'editor', 'viewer'] })
  effectiveRole!: 'owner' | 'editor' | 'viewer';

  @ApiProperty()
  inheritedAccess!: boolean;

  @ApiProperty({ enum: PermissionRole, nullable: true })
  permissionRole!: PermissionRole | null;

  @ApiProperty({ type: () => [ResourceTreeNodeDto] })
  children!: ResourceTreeNodeDto[];
}
