import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ProcessingStatus, ResourceType } from '@prisma/client';
import { Job } from 'bullmq';
import { execFile } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import * as fs from 'fs/promises';
import { promisify } from 'util';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { ImageContentPolicy } from '../uploads/image-content.policy';
import { StoragePathService } from '../storage/storage-path.service';
import { CompressionJobData, IMAGE_COMPRESSION_QUEUE } from './jobs.queue';

const JPEG_QUALITY = 80;
const WEBP_QUALITY = 80;
const PNG_COMPRESSION_LEVEL = 8;
const execFileAsync = promisify(execFile);

@Processor(IMAGE_COMPRESSION_QUEUE)
export class JobsProcessor extends WorkerHost {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly storagePathService: StoragePathService,
  ) {
    super();
  }

  async process(job: Job<CompressionJobData>): Promise<void> {
    const { resourceId, storagePath, stagedPath, mimeType } = job.data;
    const resource = await this.prismaService.resource.findUnique({
      where: { id: resourceId },
    });

    if (
      !resource ||
      resource.type !== ResourceType.FILE ||
      resource.storagePath !== storagePath
    ) {
      return;
    }

    await this.prismaService.resource.update({
      where: { id: resourceId },
      data: { processingStatus: ProcessingStatus.PROCESSING },
    });

    const isVideo = mimeType.startsWith('video/');
    const outputExtension = isVideo ? '.mp4' : this.resolveOutputExtension(mimeType);
    const compressedFilename = `${resourceId}${outputExtension}`;
    const compressedPath =
      this.storagePathService.buildCompressedImagePath(compressedFilename);
    const absoluteOutputPath =
      this.storagePathService.resolveCompressedAbsolutePath(compressedPath);
    const absoluteTempOutputPath = `${absoluteOutputPath}.${job.id ?? resourceId}.tmp`;

    try {
      await this.storagePathService.ensureManagedDirectories();

      const absoluteInputPath = await this.resolveInputPath(
        storagePath,
        stagedPath,
      );
      if (isVideo) {
        await this.compressVideo(absoluteInputPath, absoluteTempOutputPath);
      } else {
        await ImageContentPolicy.inspectFile(
          absoluteInputPath,
          mimeType,
          `resource${outputExtension}`,
        );
        await this.compressImage(
          absoluteInputPath,
          absoluteTempOutputPath,
          mimeType,
        );
      }
      await this.storagePathService.deleteFileIfExists(absoluteOutputPath);
      await this.storagePathService.moveFile(
        absoluteTempOutputPath,
        absoluteOutputPath,
      );

      const freshResource = await this.prismaService.resource.findUnique({
        where: { id: resourceId },
      });

      if (!freshResource) {
        await this.storagePathService.deleteFileIfExists(absoluteOutputPath);
        return;
      }

      await this.prismaService.resource.update({
        where: { id: resourceId },
        data: {
          processingStatus: ProcessingStatus.COMPLETED,
          compressedPath,
        },
      });
    } catch (error) {
      await this.storagePathService.deleteFileIfExists(absoluteTempOutputPath);

      const freshResource = await this.prismaService.resource.findUnique({
        where: { id: resourceId },
      });

      if (!freshResource) {
        await this.storagePathService.deleteFileIfExists(absoluteOutputPath);
        return;
      }

      const configuredAttempts =
        typeof job.opts.attempts === 'number' && job.opts.attempts > 0
          ? job.opts.attempts
          : 1;
      const isFinalAttempt = job.attemptsMade + 1 >= configuredAttempts;

      await this.prismaService.resource.update({
        where: { id: resourceId },
        data: {
          processingStatus: isFinalAttempt
            ? ProcessingStatus.FAILED
            : ProcessingStatus.PENDING,
        },
      });

      throw error;
    }
  }

  private async compressVideo(
    inputPath: string,
    outputPath: string,
  ): Promise<void> {
    if (!ffmpegPath) {
      throw new Error('Video compression is unavailable.');
    }

    await execFileAsync(ffmpegPath, [
      '-i',
      inputPath,
      '-c:v',
      'libx264',
      '-crf',
      '28',
      '-preset',
      'fast',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      '-y',
      outputPath,
    ]);
  }

  private async compressImage(
    inputPath: string,
    outputPath: string,
    mimeType: string,
  ): Promise<void> {
    const pipeline = sharp(inputPath, {
      pages: 1,
      limitInputPixels: ImageContentPolicy.maxPixelCount,
    });

    if (mimeType === 'image/webp') {
      await pipeline.webp({ quality: WEBP_QUALITY }).toFile(outputPath);
    } else if (mimeType === 'image/png') {
      await pipeline
        .png({ compressionLevel: PNG_COMPRESSION_LEVEL })
        .toFile(outputPath);
    } else {
      await pipeline.jpeg({ quality: JPEG_QUALITY }).toFile(outputPath);
    }
  }

  private resolveOutputExtension(mimeType: string): string {
    if (mimeType === 'image/webp') return '.webp';
    if (mimeType === 'image/png') return '.png';
    return '.jpg';
  }

  private async resolveInputPath(
    storagePath: string,
    stagedPath: string,
  ): Promise<string> {
    const managedInputPath =
      this.storagePathService.resolveOriginalAbsolutePath(storagePath);

    if (await this.pathExists(managedInputPath)) {
      return managedInputPath;
    }

    const stagedAbsolutePath =
      this.storagePathService.resolveStagedAbsolutePath(stagedPath);

    if (await this.pathExists(stagedAbsolutePath)) {
      return stagedAbsolutePath;
    }

    throw new Error('Compression source file was not found.');
  }

  private async pathExists(absolutePath: string): Promise<boolean> {
    try {
      await fs.access(absolutePath);
      return true;
    } catch {
      return false;
    }
  }
}
