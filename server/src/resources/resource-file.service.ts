import { Injectable, NotFoundException } from '@nestjs/common';
import { ResourceType } from '@prisma/client';
import type { Response } from 'express';
import { StoragePathService } from '../storage/storage-path.service';
import { serveFileAtPath } from './resources.utils';

type StreamableResource = {
  type: ResourceType;
  storagePath: string | null;
  compressedPath: string | null;
};

@Injectable()
export class ResourceFileService {
  constructor(private readonly storagePathService: StoragePathService) {}

  async streamResourceFile(
    resource: StreamableResource,
    compressed: boolean,
    res: Response,
  ): Promise<void> {
    if (resource.type !== ResourceType.FILE) {
      throw new NotFoundException('File not found.');
    }

    const relativePath = compressed
      ? resource.compressedPath
      : resource.storagePath;

    if (!relativePath) {
      throw new NotFoundException(
        compressed ? 'Compressed file not found.' : 'File not found.',
      );
    }

    const absolutePath = compressed
      ? this.storagePathService.resolveCompressedAbsolutePath(relativePath)
      : this.storagePathService.resolveOriginalAbsolutePath(relativePath);

    await serveFileAtPath(
      absolutePath,
      res,
      compressed ? 'Compressed file not found.' : 'File not found.',
    );
  }
}
