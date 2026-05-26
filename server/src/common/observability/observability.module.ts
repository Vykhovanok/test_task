import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { EventLoopMonitorService } from './event-loop-monitor.service';
import { RequestMetricsInterceptor } from './request-metrics.interceptor';

@Module({
  providers: [
    EventLoopMonitorService,
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestMetricsInterceptor,
    },
  ],
})
export class ObservabilityModule {}
