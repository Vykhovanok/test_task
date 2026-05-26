import Redis, { RedisOptions } from 'ioredis';
import { AppConfigService } from '../../config/app-config.service';

function resolveRedisUrl(appConfig: AppConfigService): string | null {
  const direct = process.env.REDIS_URL?.trim();
  if (direct) {
    return direct;
  }

  return appConfig.redisUrl;
}

export function createRedisClient(
  appConfig: AppConfigService,
  options?: RedisOptions,
): Redis {
  const redisUrl = resolveRedisUrl(appConfig);
  if (redisUrl) {
    return new Redis(redisUrl, options ?? {});
  }

  return new Redis({
    host: appConfig.redisHost,
    port: appConfig.redisPort,
    ...options,
  });
}

export function getBullMqConnection(appConfig: AppConfigService): {
  host: string;
  port: number;
  password?: string;
} {
  const redisUrl = resolveRedisUrl(appConfig);
  if (redisUrl) {
    const url = new URL(redisUrl);

    return {
      host: url.hostname,
      port: Number(url.port || 6379),
      ...(url.password
        ? { password: decodeURIComponent(url.password) }
        : {}),
    };
  }

  return {
    host: appConfig.redisHost,
    port: appConfig.redisPort,
  };
}
