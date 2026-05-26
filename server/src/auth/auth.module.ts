import { Module } from '@nestjs/common';
import { RedisModule } from '../common/redis/redis.module';
import { SessionCacheService } from '../common/session/session-cache.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { AuthController } from './auth.controller';
import { AuthSessionService } from './auth-session.service';
import { PasswordManager, TokenManager } from './auth.utils';

@Module({
  imports: [RedisModule],
  controllers: [AuthController],
  providers: [
    PasswordManager,
    TokenManager,
    SessionCacheService,
    AuthSessionService,
    AuthGuard,
  ],
  exports: [PasswordManager, TokenManager, AuthSessionService, AuthGuard],
})
export class AuthModule {}
