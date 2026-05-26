import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { diskStorage } from 'multer';
import { ImageContentPolicy } from './image-content.policy';
import { StoragePathService } from '../storage/storage-path.service';

export function createImageUploadMulterOptions(
  storagePathService: StoragePathService,
): MulterOptions {
  return {
    storage: diskStorage({
      destination: (_request, _file, callback) => {
        void storagePathService
          .ensureManagedDirectories()
          .then(() => {
            callback(null, storagePathService.stagingRoot);
          })
          .catch((error: unknown) => {
            callback(error as Error, storagePathService.stagingRoot);
          });
      },
      filename: (_request, _file, callback) => {
        callback(null, storagePathService.createStagedFilename());
      },
    }),
    limits: {
      fileSize: ImageContentPolicy.maxFileSizeInBytes,
    },
  };
}

export function createMissingFileException(
  kind: 'image' | 'video' = 'image',
): BadRequestException {
  const message =
    kind === 'video'
      ? 'A video file is required.'
      : 'An image file is required.';
  return new BadRequestException(message);
}
