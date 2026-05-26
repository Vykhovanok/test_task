import { ApiProperty } from '@nestjs/swagger';
import { InvitationStatus, PermissionRole } from '@prisma/client';
import { IsEmail, IsEnum, IsNotEmpty, IsString } from 'class-validator';

export class CreateShareInvitationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  resourceId!: string;

  @ApiProperty({ example: 'collaborator@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: PermissionRole })
  @IsEnum(PermissionRole)
  role!: PermissionRole;
}

export class ShareInvitationResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  resourceId!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: PermissionRole })
  role!: PermissionRole;

  @ApiProperty({ enum: InvitationStatus })
  status!: InvitationStatus;

  @ApiProperty()
  createdByUserId!: string;

  @ApiProperty()
  createdAt!: Date;
}
