import { NestFactory } from '@nestjs/core';
import { WorkerAppModule } from './worker-app.module';

async function bootstrap(): Promise<void> {
  process.env.RUN_WORKERS = 'true';
  const app = await NestFactory.createApplicationContext(WorkerAppModule);
  await app.init();
}

void bootstrap();
