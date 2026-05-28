import { Injectable, Logger } from '@nestjs/common';

type RuntimeEnvironment = 'development' | 'test' | 'production';

type PublicRateLimitConfig = {
  windowMs: number;
  maxRequests: number;
};

@Injectable()
export class AppConfigService {
  private readonly logger = new Logger(AppConfigService.name);
  private readonly nodeEnv = this.resolveNodeEnv();
  private readonly jwtSecret = this.resolveJwtSecret();

  readonly clientOrigins = this.resolveClientOrigins();
  readonly clientOrigin = this.clientOrigins[0];
  readonly port = this.readPositiveInt('PORT', 3000);
  readonly redisUrl = this.resolveRedisUrl();
  readonly redisHost = this.resolveRedisHost();
  readonly redisPort = this.resolveRedisPort();
  readonly trustProxy = process.env.TRUST_PROXY === 'true';
  readonly enableSwagger =
    process.env.ENABLE_SWAGGER === 'true' || this.isDevelopmentLike;
  readonly accessTokenTtl = process.env.ACCESS_TOKEN_TTL ?? '24h';
  readonly sessionTtlMs = this.readPositiveInt(
    'SESSION_TTL_MS',
    24 * 60 * 60 * 1000,
  );
  readonly publicLinkTtlMs = this.readPositiveInt(
    'PUBLIC_LINK_TTL_MS',
    30 * 24 * 60 * 60 * 1000,
  );

  readonly rateLimits = {
    auth: this.readRateLimit('AUTH_RATE_LIMIT', 60_000, 10),
    uploads: this.readRateLimit('UPLOAD_RATE_LIMIT', 60_000, 20),
    search: this.readRateLimit('SEARCH_RATE_LIMIT', 60_000, 120),
    children: this.readRateLimit('CHILDREN_RATE_LIMIT', 60_000, 600),
    events: this.readRateLimit('EVENTS_RATE_LIMIT', 60_000, 30),
    publicLinks: this.readRateLimit('PUBLIC_LINK_RATE_LIMIT', 60_000, 120),
  };

  readonly runWorkers = this.resolveRunWorkers();

  get runtimeEnvironment(): RuntimeEnvironment {
    return this.nodeEnv;
  }

  get isDevelopmentLike(): boolean {
    return this.nodeEnv === 'development' || this.nodeEnv === 'test';
  }

  getJwtSecret(): string {
    return this.jwtSecret;
  }

  private resolveRedisUrl(): string | null {
    const value = process.env.REDIS_URL?.trim();
    return value ? value : null;
  }

  private resolveRedisHost(): string {
    const fromEnv = process.env.REDIS_HOST?.trim();
    if (fromEnv) {
      return fromEnv;
    }

    const parsed = this.parseRedisUrl();
    if (parsed) {
      return parsed.hostname;
    }

    return 'localhost';
  }

  private resolveRedisPort(): number {
    const fromEnv = process.env.REDIS_PORT?.trim();
    if (fromEnv) {
      const parsed = Number(fromEnv);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }

    const parsed = this.parseRedisUrl();
    if (parsed) {
      return Number(parsed.port || 6379);
    }

    return 6379;
  }

  private parseRedisUrl(): URL | null {
    const redisUrl = this.resolveRedisUrl();
    if (!redisUrl) {
      return null;
    }

    try {
      return new URL(redisUrl);
    } catch {
      this.logger.warn('REDIS_URL is set but could not be parsed.');
      return null;
    }
  }

  isClientOriginAllowed(origin: string | undefined): boolean {
    if (!origin) {
      return true;
    }

    return this.clientOrigins.includes(origin);
  }

  private resolveClientOrigins(): string[] {
    const configured = this.normalizeOrigin(process.env.CLIENT_ORIGIN);

    if (configured) {
      return [configured];
    }

    if (this.nodeEnv === 'production') {
      this.logger.warn(
        'CLIENT_ORIGIN is not set. Allowing https://test-task-client.onrender.com for deployment.',
      );
      return ['https://test-task-client.onrender.com'];
    }

    if (this.nodeEnv === 'test') {
      return ['http://localhost:3001'];
    }

    this.logger.warn(
      'CLIENT_ORIGIN is not set. Using http://localhost:3001 for local development.',
    );

    return ['http://localhost:3001'];
  }

  private normalizeOrigin(value: string | undefined): string | null {
    const trimmed = value?.trim().replace(/^['"]|['"]$/g, '').replace(/\/$/, '');

    return trimmed ? trimmed : null;
  }

  private resolveRunWorkers(): boolean {
    const raw = process.env.RUN_WORKERS?.trim().toLowerCase();

    if (raw === 'true') {
      return true;
    }

    if (raw === 'false') {
      return false;
    }

    return this.nodeEnv !== 'production';
  }

  private resolveNodeEnv(): RuntimeEnvironment {
    const raw = process.env.NODE_ENV?.trim().toLowerCase();

    if (raw === 'production') {
      return 'production';
    }

    if (raw === 'test') {
      return 'test';
    }

    return 'development';
  }

  private resolveJwtSecret(): string {
    const secret = process.env.JWT_SECRET?.trim();

    if (secret) {
      return secret;
    }

    if (this.nodeEnv === 'production') {
      throw new Error(
        'JWT_SECRET is required in production. Refusing to boot with an insecure auth configuration.',
      );
    }

    if (this.nodeEnv === 'test') {
      return 'integration-test-secret';
    }

    this.logger.warn(
      'JWT_SECRET is not set. Using a local-development fallback secret because NODE_ENV is not production.',
    );

    return 'development-local-only-secret';
  }

  private readRateLimit(
    envPrefix: string,
    defaultWindowMs: number,
    defaultMaxRequests: number,
  ): PublicRateLimitConfig {
    return {
      windowMs: this.readPositiveInt(
        `${envPrefix}_WINDOW_MS`,
        defaultWindowMs,
      ),
      maxRequests: this.readPositiveInt(
        `${envPrefix}_MAX_REQUESTS`,
        defaultMaxRequests,
      ),
    };
  }

  private readPositiveInt(key: string, fallback: number): number {
    const raw = process.env[key];
    const parsed = raw === undefined ? fallback : Number(raw);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      if (raw !== undefined) {
        this.logger.warn(
          `Invalid ${key}="${raw}". Falling back to ${fallback}.`,
        );
      }

      return fallback;
    }

    return parsed;
  }
}
