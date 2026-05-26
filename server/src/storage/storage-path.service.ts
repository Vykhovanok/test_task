import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

const STORAGE_ROOT_NAME = 'storage';
const STAGING_ROOT_NAME = 'staging';
const IMAGES_ROOT_NAME = 'images';
const COMPRESSED_ROOT_NAME = 'compressed';

function assertInsideRoot(absolutePath: string, rootPath: string): string {
  const normalizedRoot = path.resolve(rootPath);
  const normalizedTarget = path.resolve(absolutePath);
  const rootWithSeparator = normalizedRoot.endsWith(path.sep)
    ? normalizedRoot
    : `${normalizedRoot}${path.sep}`;

  if (
    normalizedTarget !== normalizedRoot &&
    !normalizedTarget.startsWith(rootWithSeparator)
  ) {
    throw new BadRequestException(
      'Resolved file path escaped the storage root.',
    );
  }

  return normalizedTarget;
}

@Injectable()
export class StoragePathService {
  readonly storageRoot = path.resolve(process.cwd(), STORAGE_ROOT_NAME);
  readonly stagingRoot = path.resolve(this.storageRoot, STAGING_ROOT_NAME);
  readonly imagesRoot = path.resolve(this.storageRoot, IMAGES_ROOT_NAME);
  readonly compressedRoot = path.resolve(
    this.storageRoot,
    COMPRESSED_ROOT_NAME,
  );

  createStagedFilename(): string {
    return `${randomUUID()}.upload`;
  }

  createManagedFilename(extension: string): string {
    return `${randomUUID()}${extension}`;
  }

  buildStagingRelativePath(filename: string): string {
    return path.posix.join(STORAGE_ROOT_NAME, STAGING_ROOT_NAME, filename);
  }

  buildStoredImagePath(filename: string): string {
    return path.posix.join(STORAGE_ROOT_NAME, IMAGES_ROOT_NAME, filename);
  }

  buildCompressedImagePath(filename: string): string {
    return path.posix.join(STORAGE_ROOT_NAME, COMPRESSED_ROOT_NAME, filename);
  }

  resolveStagedAbsolutePath(stagedPathOrFilename: string): string {
    const normalizedValue = stagedPathOrFilename.replace(/\\/g, '/');
    const filename = normalizedValue.startsWith(
      `${STORAGE_ROOT_NAME}/${STAGING_ROOT_NAME}/`,
    )
      ? path.posix.basename(normalizedValue)
      : path.basename(normalizedValue);

    return assertInsideRoot(
      path.resolve(this.stagingRoot, filename),
      this.stagingRoot,
    );
  }

  resolveOriginalAbsolutePath(storagePath: string): string {
    return this.resolveManagedAbsolutePath(
      storagePath,
      IMAGES_ROOT_NAME,
      this.imagesRoot,
    );
  }

  resolveCompressedAbsolutePath(storagePath: string): string {
    return this.resolveManagedAbsolutePath(
      storagePath,
      COMPRESSED_ROOT_NAME,
      this.compressedRoot,
    );
  }

  async ensureManagedDirectories(): Promise<void> {
    await Promise.all([
      fs.mkdir(this.stagingRoot, { recursive: true }),
      fs.mkdir(this.imagesRoot, { recursive: true }),
      fs.mkdir(this.compressedRoot, { recursive: true }),
    ]);
  }

  async moveFile(sourcePath: string, destinationPath: string): Promise<void> {
    await fs.mkdir(path.dirname(destinationPath), { recursive: true });
    await fs.rename(sourcePath, destinationPath);
  }

  async copyFile(sourcePath: string, destinationPath: string): Promise<void> {
    await fs.mkdir(path.dirname(destinationPath), { recursive: true });
    await fs.copyFile(sourcePath, destinationPath);
  }

  async deleteFileIfExists(absolutePath: string): Promise<void> {
    try {
      await fs.unlink(absolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async assertPathExists(absolutePath: string): Promise<void> {
    await fs.access(absolutePath);
  }

  private resolveManagedAbsolutePath(
    storagePath: string,
    areaName: string,
    root: string,
  ): string {
    const normalizedRelativePath = storagePath.replace(/\\/g, '/');
    const expectedPrefix = `${STORAGE_ROOT_NAME}/${areaName}/`;

    if (!normalizedRelativePath.startsWith(expectedPrefix)) {
      throw new BadRequestException('Invalid storage path prefix.');
    }

    return assertInsideRoot(
      path.resolve(process.cwd(), normalizedRelativePath),
      root,
    );
  }
}
