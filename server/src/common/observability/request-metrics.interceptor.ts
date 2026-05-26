import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

@Injectable()
export class RequestMetricsInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestMetricsInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = process.hrtime.bigint();
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs =
            Number(process.hrtime.bigint() - startedAt) / 1_000_000;

          if (durationMs >= 500) {
            this.logger.warn(
              `${request.method} ${request.url} ${response.statusCode} ${durationMs.toFixed(1)}ms`,
            );
          }
        },
        error: () => {
          const durationMs =
            Number(process.hrtime.bigint() - startedAt) / 1_000_000;

          this.logger.warn(
            `${request.method} ${request.url} failed after ${durationMs.toFixed(1)}ms`,
          );
        },
      }),
    );
  }
}
