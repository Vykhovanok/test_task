import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { AuthModule } from '../auth/auth.module';
import { JobsModule } from '../jobs/jobs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ResourcesModule } from '../resources/resources.module';
import { StorageModule } from '../storage/storage.module';
import { StoragePathService } from '../storage/storage-path.service';
import { createImageUploadMulterOptions } from './multer.config';
import { UploadsController } from './uploads.controller';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    JobsModule,
    StorageModule,
    ResourcesModule,
    MulterModule.registerAsync({
      imports: [StorageModule],
      inject: [StoragePathService],
      useFactory: (storagePathService: StoragePathService) =>
        createImageUploadMulterOptions(storagePathService),
    }),
  ],
  controllers: [UploadsController],
})
export class UploadsModule {}