import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ResourceChangeEvent } from './resource-events.types';
import { ResourceEventsService } from './resource-events.service';

@Injectable()
export class ResourceNotificationService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly resourceEventsService: ResourceEventsService,
  ) {}

  async notifyChange(
    actorUserId: string,
    event: ResourceChangeEvent,
  ): Promise<void> {
    const recipients = await this.resolveRecipientUserIds(
      event.resourceId,
      actorUserId,
    );

    await this.resourceEventsService.publishToUsers(recipients, event);
  }

  private async resolveRecipientUserIds(
    resourceId: string,
    actorUserId: string,
  ): Promise<string[]> {
    const rows = await this.prismaService.$queryRaw<
      Array<{ user_id: string }>
    >`
      WITH RECURSIVE lineage AS (
        SELECT id, "ownerId", "parentId"
        FROM "Resource"
        WHERE id = CAST(${resourceId} AS UUID)

        UNION

        SELECT parent.id, parent."ownerId", parent."parentId"
        FROM "Resource" parent
        INNER JOIN lineage ON lineage."parentId" = parent.id
      )
      SELECT DISTINCT user_id
      FROM (
        SELECT lineage."ownerId" AS user_id
        FROM lineage

        UNION

        SELECT rp."userId" AS user_id
        FROM "ResourcePermission" rp
        WHERE rp."resourceId" IN (SELECT id FROM lineage)
      ) recipients
      WHERE user_id IS NOT NULL
    `;

    const userIds = rows.map((row) => row.user_id);

    if (!userIds.includes(actorUserId)) {
      userIds.push(actorUserId);
    }

    return userIds;
  }
}
