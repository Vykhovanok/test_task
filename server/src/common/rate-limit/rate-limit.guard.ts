import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppConfigService } from '../../config/app-config.service';
import {
  RATE_LIMIT_METADATA_KEY,
  type RateLimitPolicy,
} from './rate-limit.decorator';
import { RedisRateLimitService } from './redis-rate-limit.service';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly appConfigService: AppConfigService,
    private readonly redisRateLimitService: RedisRateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<RateLimitPolicy | undefined>(
      RATE_LIMIT_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!policy) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const config = this.appConfigService.rateLimits[policy.key];
    const routeKey = `${policy.key}:${this.getClientIdentifier(request)}`;
    const allowed = await this.redisRateLimitService.consume(
      routeKey,
      config.windowMs,
      config.maxRequests,
    );

    if (!allowed) {
      throw new HttpException(
        'Too many requests for this endpoint. Retry later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private getClientIdentifier(request: Request): string {
    if (this.appConfigService.trustProxy) {
      const forwardedFor = request.headers['x-forwarded-for'];

      if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
        const hops = forwardedFor.split(',').map((value) => value.trim());
        return hops[hops.length - 1] ?? 'unknown';
      }
    }

    return request.ip || request.socket.remoteAddress || 'unknown';
  }
}
