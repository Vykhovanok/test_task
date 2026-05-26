import Redis, { RedisOptions } from 'ioredis';
import { AppConfigService } from '../../config/app-config.service';

export function createRedisClient(
  appConfig: AppConfigService,
  options?: RedisOptions,
): Redis {
  if (appConfig.redisUrl) {
    return new Redis(appConfig.redisUrl, options ?? {});
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
  if (appConfig.redisUrl) {
    const url = new URL(appConfig.redisUrl);

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
