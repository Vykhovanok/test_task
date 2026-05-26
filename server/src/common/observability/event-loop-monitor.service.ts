import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { monitorEventLoopDelay } from 'perf_hooks';

@Injectable()
export class EventLoopMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventLoopMonitorService.name);
  private readonly histogram = monitorEventLoopDelay({ resolution: 20 });
  private interval: NodeJS.Timeout | null = null;

  onModuleInit(): void {
    this.histogram.enable();
    this.interval = setInterval(() => {
      const p99Ms = this.histogram.percentile(99) / 1_000_000;

      if (p99Ms >= 100) {
        this.logger.warn(`Event loop delay p99=${p99Ms.toFixed(1)}ms`);
      }

      this.histogram.reset();
    }, 30_000);
  }

  onModuleDestroy(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    this.histogram.disable();
  }
}
