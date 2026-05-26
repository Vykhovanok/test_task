import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ResourceTreeBuilder } from './resources.utils';
import type { ResourceWithPermissions } from './resources.types';

type PrismaDbClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class ResourceOrderingService {
  constructor(private readonly prismaService: PrismaService) {}

  async lockParentScopes(
    parentIds: Array<string | null>,
    db: PrismaDbClient,
  ): Promise<void> {
    const uniqueParentIds = Array.from(
      new Set(parentIds.map((parentId) => parentId ?? 'root')),
    ).sort();

    for (const parentScope of uniqueParentIds) {
      await db.$executeRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtext(${parentScope})::bigint)
      `);
    }
  }

  async allocateNextSortOrder(
    parentId: string | null,
    db: PrismaDbClient = this.prismaService,
  ): Promise<number> {
    const currentMax = await db.resource.aggregate({
      where: { parentId },
      _max: { sortOrder: true },
    });

    return (currentMax._max.sortOrder ?? -1) + 1;
  }

  async normalizeSiblingOrder(
    parentId: string | null,
    db: PrismaDbClient,
  ): Promise<void> {
    const siblings = await db.resource.findMany({
      where: { parentId },
      select: { id: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    await Promise.all(
      siblings.map((resource, index) =>
        db.resource.update({
          where: { id: resource.id },
          data: { sortOrder: index },
        }),
      ),
    );
  }
}
