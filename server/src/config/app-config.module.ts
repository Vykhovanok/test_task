import { Global, Module } from '@nestjs/common';
import { AppConfigService } from './app-config.service';
import { RateLimitGuard } from '../common/rate-limit/rate-limit.guard';
import { RedisRateLimitService } from '../common/rate-limit/redis-rate-limit.service';

@Global()
@Module({
  providers: [AppConfigService, RedisRateLimitService, RateLimitGuard],
  exports: [AppConfigService, RedisRateLimitService, RateLimitGuard],
})
export class AppConfigModule {}
