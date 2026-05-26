import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Post,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { User } from '@prisma/client';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../common/rate-limit/rate-limit.guard';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AuthResponseDto,
  AuthUserDto,
  LoginDto,
  RegisterDto,
} from './auth.dto';
import { AUTH_SESSION_COOKIE, DUMMY_PASSWORD_HASH } from './auth.constants';
import type { AuthContext } from './auth.types';
import { AuthSessionService } from './auth-session.service';
import { TokenManager, PasswordManager } from './auth.utils';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly passwordManager: PasswordManager,
    private readonly tokenManager: TokenManager,
    private readonly authSessionService: AuthSessionService,
    private readonly appConfigService: AppConfigService,
  ) {}

  @Post('register')
  @UseGuards(RateLimitGuard)
  @RateLimit({ key: 'auth' })
  @ApiOperation({ summary: 'Register a new user.' })
  @ApiOkResponse({ type: AuthResponseDto })
  async register(
    @Body() payload: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    const normalizedEmail = payload.email.toLowerCase();
    const existingUser = await this.prismaService.user.findUnique({
      where: {
        email: normalizedEmail,
      },
    });

    if (existingUser) {
      throw new ConflictException(
        'Registration could not be completed. Try signing in or use a different email.',
      );
    }

    try {
      const passwordHash = await this.passwordManager.hash(payload.password);
      const user = await this.prismaService.user.create({
        data: {
          email: normalizedEmail,
          name: payload.name.trim(),
          passwordHash,
        },
      });

      return this.createAuthResponse(user, response);
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Registration could not be completed. Try signing in or use a different email.',
        );
      }

      throw error;
    }
  }

  @Post('login')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @RateLimit({ key: 'auth' })
  @ApiOperation({ summary: 'Authenticate an existing user.' })
  @ApiOkResponse({ type: AuthResponseDto })
  async login(
    @Body() payload: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    const user = await this.prismaService.user.findUnique({
      where: {
        email: payload.email.toLowerCase(),
      },
    });

    const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const passwordMatches = await this.passwordManager.verify(
      payload.password,
      passwordHash,
    );

    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    return this.createAuthResponse(user, response);
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke the current session.' })
  async logout(
    @CurrentUser() authContext: AuthContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authSessionService.revokeSession(authContext.sessionId);
    this.clearSessionCookie(response);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Return the current authenticated user context.' })
  @ApiOkResponse({ type: AuthUserDto })
  async me(@CurrentUser() authContext: AuthContext): Promise<AuthUserDto> {
    const user = await this.prismaService.user.findUnique({
      where: {
        id: authContext.userId,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid or expired access token.');
    }

    return this.createUserDto(user);
  }

  private async createAuthResponse(
    user: User,
    response: Response,
  ): Promise<AuthResponseDto> {
    const sessionId = await this.authSessionService.createSession(
      user.id,
      this.appConfigService.sessionTtlMs,
    );
    const accessToken = this.tokenManager.issue({
      userId: user.id,
      email: user.email,
      name: user.name,
      sessionId,
    });

    this.setSessionCookie(response, accessToken);

    return {
      accessToken,
      tokenType: 'Bearer',
      user: this.createUserDto(user),
    };
  }

  private setSessionCookie(response: Response, accessToken: string): void {
    response.cookie(AUTH_SESSION_COOKIE, accessToken, {
      httpOnly: true,
      secure: this.appConfigService.runtimeEnvironment === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: this.appConfigService.sessionTtlMs,
    });
  }

  private clearSessionCookie(response: Response): void {
    response.clearCookie(AUTH_SESSION_COOKIE, {
      httpOnly: true,
      secure: this.appConfigService.runtimeEnvironment === 'production',
      sameSite: 'lax',
      path: '/',
    });
  }

  private createUserDto(user: User): AuthUserDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
    };
  }
}
