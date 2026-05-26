import { ApiProperty } from '@nestjs/swagger';
import {
  PermissionRole,
  ProcessingStatus,
  ResourceType,
  Visibility,
} from '@prisma/client';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreatePublicLinkDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  resourceId!: string;
}

export class PublicLinkResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  resourceId!: string;

  @ApiProperty({ nullable: true })
  token!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  expiresAt!: Date;

  @ApiProperty()
  createdByUserId!: string;

  @ApiProperty()
  createdAt!: Date;
}

export class PublicLinkResourceNodeDto {
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
  @ApiProperty({ nullable: true })
  fileUrl!: string | null;
  @ApiProperty({ nullable: true })
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
  @ApiProperty({ enum: ['viewer'] })
  effectiveRole!: 'viewer';
  @ApiProperty()
  inheritedAccess!: boolean;
  @ApiProperty({ enum: PermissionRole, nullable: true })
  permissionRole!: null;
  @ApiProperty({ type: () => [PublicLinkResourceNodeDto] })
  children!: PublicLinkResourceNodeDto[];
}
