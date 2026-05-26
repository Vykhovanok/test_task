import { Injectable, UnauthorizedException } from '@nestjs/common';
import { SessionCacheService } from '../common/session/session-cache.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthSessionService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly sessionCacheService: SessionCacheService,
  ) {}

  async createSession(userId: string, ttlMs: number): Promise<string> {
    const expiresAt = new Date(Date.now() + ttlMs);

    const session = await this.prismaService.authSession.create({
      data: {
        userId,
        expiresAt,
      },
      select: {
        id: true,
      },
    });

    return session.id;
  }

  async assertActiveSession(sessionId: string): Promise<void> {
    const cached = await this.sessionCacheService.isActive(sessionId);

    if (cached === true) {
      return;
    }

    const session = await this.prismaService.authSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Invalid or expired access token.');
    }

    await this.sessionCacheService.markActive(sessionId);
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.sessionCacheService.revoke(sessionId);
    await this.prismaService.authSession.updateMany({
      where: {
        id: sessionId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }
}
