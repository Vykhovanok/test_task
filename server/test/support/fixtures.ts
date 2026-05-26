import { PermissionRole, ResourceType, Visibility } from '@prisma/client';
import sharp from 'sharp';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { AuthSessionService } from '../../src/auth/auth-session.service';
import { PasswordManager, TokenManager } from '../../src/auth/auth.utils';
import { hashOpaqueToken } from '../../src/common/crypto/token-hash.util';
import { AppConfigService } from '../../src/config/app-config.service';

type CreateUserInput = {
  email: string;
  password?: string;
  name?: string;
};

type CreateResourceInput = {
  name: string;
  ownerId: string;
  type?: ResourceType;
  parentId?: string | null;
  visibility?: Visibility;
  sortOrder?: number;
  mimeType?: string | null;
  originalFilename?: string | null;
  storagePath?: string | null;
  compressedPath?: string | null;
  size?: number | null;
  processingStatus?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | null;
};

export async function createUser(
  prisma: PrismaService,
  passwordManager: PasswordManager,
  input: CreateUserInput,
) {
  return prisma.user.create({
    data: {
      email: input.email,
      name: input.name ?? input.email.split('@')[0] ?? 'user',
      passwordHash: await passwordManager.hash(input.password ?? 'password123'),
    },
  });
}

export async function issueToken(
  tokenManager: TokenManager,
  authSessionService: AuthSessionService,
  appConfigService: AppConfigService,
  user: { id: string; email: string; name: string },
) {
  const sessionId = await authSessionService.createSession(
    user.id,
    appConfigService.sessionTtlMs,
  );

  return tokenManager.issue({
    userId: user.id,
    email: user.email,
    name: user.name,
    sessionId,
  });
}

export async function createTestPublicLink(
  prisma: PrismaService,
  input: {
    resourceId: string;
    plainToken: string;
    createdByUserId: string;
    isActive?: boolean;
    expiresAt?: Date;
  },
) {
  return prisma.publicLink.create({
    data: {
      resourceId: input.resourceId,
      tokenHash: hashOpaqueToken(input.plainToken),
      expiresAt:
        input.expiresAt ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      isActive: input.isActive ?? true,
      createdByUserId: input.createdByUserId,
    },
  });
}

export async function createResource(
  prisma: PrismaService,
  input: CreateResourceInput,
) {
  return prisma.resource.create({
    data: {
      name: input.name,
      ownerId: input.ownerId,
      type: input.type ?? ResourceType.FOLDER,
      parentId: input.parentId ?? null,
      visibility: input.visibility ?? Visibility.PRIVATE,
      sortOrder: input.sortOrder ?? 0,
      mimeType: input.mimeType ?? null,
      originalFilename: input.originalFilename ?? null,
      storagePath: input.storagePath ?? null,
      compressedPath: input.compressedPath ?? null,
      size: input.size ?? null,
      processingStatus: input.processingStatus ?? null,
    },
    include: {
      permissions: true,
    },
  });
}

export async function grantPermission(
  prisma: PrismaService,
  resourceId: string,
  userId: string,
  role: PermissionRole,
  shareInvitationId?: string | null,
) {
  return prisma.resourcePermission.create({
    data: {
      resourceId,
      userId,
      role,
      shareInvitationId: shareInvitationId ?? null,
    },
  });
}

export async function createPngBuffer(
  width = 8,
  height = 8,
  color = { r: 32, g: 64, b: 128, alpha: 1 },
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: color,
    },
  })
    .png()
    .toBuffer();
}

export async function createJpegBuffer(
  width = 8,
  height = 8,
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 160, g: 120, b: 80 },
    },
  })
    .jpeg()
    .toBuffer();
}

export async function createOversizedPngBuffer(): Promise<Buffer> {
  return sharp({
    create: {
      width: 8_100,
      height: 2,
      channels: 4,
      background: { r: 1, g: 2, b: 3, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

export const tinyGifBuffer = Buffer.from(
  '47494638396101000100800000000000ffffff21f90401000001002c00000000010001000002024401003b',
  'hex',
);
