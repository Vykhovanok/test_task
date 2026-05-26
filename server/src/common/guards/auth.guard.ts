import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  AuthContext,
  RequestWithAuthContext,
} from '../../auth/auth.types';
import { AUTH_SESSION_COOKIE } from '../../auth/auth.constants';
import { TokenManager } from '../../auth/auth.utils';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly tokenManager: TokenManager) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithAuthContext>();
    const authContext = await this.resolveAuthContext(request);

    request.authContext = authContext;

    return true;
  }

  private async resolveAuthContext(
    request: RequestWithAuthContext,
  ): Promise<AuthContext> {
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Authorization header is required.');
    }

    return this.tokenManager.verifyUserToken(token);
  }

  private extractToken(request: RequestWithAuthContext): string | null {
    const queryToken = request.query.access_token;

    if (typeof queryToken === 'string' && queryToken.trim()) {
      return queryToken.trim();
    }

    const authorizationHeader = request.headers.authorization;

    if (authorizationHeader) {
      const [scheme, token] = authorizationHeader.split(' ');

      if (scheme === 'Bearer' && token) {
        return token;
      }

      throw new UnauthorizedException('Invalid authorization header format.');
    }

    const cookieToken = request.cookies?.[AUTH_SESSION_COOKIE];

    if (typeof cookieToken === 'string' && cookieToken.trim()) {
      return cookieToken.trim();
    }

    return null;
  }
}
