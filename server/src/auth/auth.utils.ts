import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { AuthContext, JwtPayload } from './auth.types';
import { AUTH_BEARER_SCHEME } from './auth.constants';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { AppConfigService } from '../config/app-config.service';
import { AuthSessionService } from './auth-session.service';

type AuthTokenInput = {
  userId: string;
  email: string;
  name: string;
  sessionId: string;
};

@Injectable()
export class PasswordManager {
  async hash(plainText: string): Promise<string> {
    return bcrypt.hash(plainText, 12);
  }

  async verify(plainText: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(plainText, passwordHash);
  }
}

@Injectable()
export class TokenManager {
  constructor(
    private readonly appConfigService: AppConfigService,
    private readonly authSessionService: AuthSessionService,
  ) {}

  issue(input: AuthTokenInput): string {
    return jwt.sign(
      {
        sub: input.userId,
        email: input.email,
        name: input.name,
        sid: input.sessionId,
      },
      this.getSecret(),
      {
        expiresIn: this.appConfigService.accessTokenTtl as SignOptions['expiresIn'],
        algorithm: 'HS256',
      },
    );
  }

  async verifyUserToken(token: string): Promise<AuthContext> {
    try {
      const payload = jwt.verify(token, this.getSecret(), {
        algorithms: ['HS256'],
      }) as JwtPayload;

      await this.authSessionService.assertActiveSession(payload.sid);

      return {
        userId: payload.sub,
        email: payload.email,
        name: payload.name,
        sessionId: payload.sid,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Invalid or expired access token.');
    }
  }

  getBearerTokenValue(token: string): string {
    return `${AUTH_BEARER_SCHEME} ${token}`;
  }

  private getSecret(): string {
    return this.appConfigService.getJwtSecret();
  }
}
