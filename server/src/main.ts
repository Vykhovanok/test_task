import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const appConfigService = app.get(AppConfigService);
  const bootstrapLogger = new Logger('Bootstrap');
  bootstrapLogger.log(
    `Redis target ${appConfigService.redisHost}:${appConfigService.redisPort}`,
  );

  if (appConfigService.trustProxy) {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  app.use(helmet());
  app.use(cookieParser());

  app.enableCors({
    origin: appConfigService.clientOrigin,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  if (appConfigService.enableSwagger) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('File Storage Service API')
      .setDescription('REST API for the file storage service.')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);

    SwaggerModule.setup('docs', app, swaggerDocument);
  }

  await app.listen(appConfigService.port);
}
void bootstrap();
