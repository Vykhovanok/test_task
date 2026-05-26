import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import * as path from 'path';
import sharp from 'sharp';

export type SupportedImageFormat = 'jpeg' | 'png' | 'webp';

export type ImageInspectionResult = {
  detectedFormat: SupportedImageFormat;
  normalizedMimeType: string;
  normalizedExtension: string;
  width: number;
  height: number;
  frameCount: number;
};

export class ImageContentPolicy {
  static readonly maxFileSizeInBytes = 10 * 1024 * 1024;
  static readonly maxWidth = 8_000;
  static readonly maxHeight = 8_000;
  static readonly maxPixelCount = 40_000_000;
  static readonly maxFrameCount = 1;

  private static readonly formatToMimeType = {
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  } satisfies Record<SupportedImageFormat, string>;

  private static readonly formatToExtensions = {
    jpeg: new Set(['.jpg', '.jpeg']),
    png: new Set(['.png']),
    webp: new Set(['.webp']),
  } satisfies Record<SupportedImageFormat, Set<string>>;

  static assertSize(fileSize: number): void {
    if (fileSize > this.maxFileSizeInBytes) {
      throw new PayloadTooLargeException(
        'The uploaded file exceeds the size limit.',
      );
    }
  }

  static async inspectFile(
    filePath: string,
    declaredMimeType: string,
    originalFilename: string,
  ): Promise<ImageInspectionResult> {
    const metadata = await this.readMetadata(filePath);
    const detectedFormat = this.assertSupportedFormat(metadata.format);
    const normalizedMimeType = this.formatToMimeType[detectedFormat];
    const normalizedExtension = this.resolveNormalizedExtension(
      detectedFormat,
      originalFilename,
    );

    this.assertMimeTypeMatches(declaredMimeType, normalizedMimeType);
    this.assertSafeDimensions(metadata.width, metadata.height);
    this.assertFrameCount(metadata.pages);

    return {
      detectedFormat,
      normalizedMimeType,
      normalizedExtension,
      width: metadata.width,
      height: metadata.height,
      frameCount: metadata.pages ?? 1,
    };
  }

  static isSupportedDeclaredExtension(filename: string): boolean {
    const extension = path.extname(filename).toLowerCase();

    return Object.values(this.formatToExtensions).some((extensions) =>
      extensions.has(extension),
    );
  }

  private static async readMetadata(filePath: string) {
    try {
      const metadata = await sharp(filePath, {
        pages: this.maxFrameCount,
        limitInputPixels: this.maxPixelCount,
      }).metadata();

      if (!metadata.format || !metadata.width || !metadata.height) {
        throw new BadRequestException(
          'The uploaded file content is not a valid image.',
        );
      }

      return metadata;
    } catch (error) {
      if (error instanceof PayloadTooLargeException) {
        throw error;
      }

      throw new BadRequestException(
        'The uploaded file content is not a valid image.',
      );
    }
  }

  private static assertSupportedFormat(format: string): SupportedImageFormat {
    if (format === 'jpeg' || format === 'png' || format === 'webp') {
      return format;
    }

    throw new UnsupportedMediaTypeException(
      'Only JPEG, PNG, and WebP images are supported.',
    );
  }

  private static resolveNormalizedExtension(
    format: SupportedImageFormat,
    originalFilename: string,
  ): string {
    const extension = path.extname(originalFilename).toLowerCase();
    const allowedExtensions = this.formatToExtensions[format];

    if (!allowedExtensions.has(extension)) {
      throw new UnsupportedMediaTypeException(
        'The uploaded file extension does not match the decoded image format.',
      );
    }

    return format === 'jpeg' ? '.jpg' : extension;
  }

  private static assertMimeTypeMatches(
    declaredMimeType: string,
    normalizedMimeType: string,
  ): void {
    if (declaredMimeType !== normalizedMimeType) {
      throw new UnsupportedMediaTypeException(
        'The uploaded file MIME type does not match the decoded image format.',
      );
    }
  }

  private static assertSafeDimensions(
    width: number | undefined,
    height: number | undefined,
  ): void {
    if (!width || !height) {
      throw new BadRequestException(
        'The uploaded file content is not a valid image.',
      );
    }

    if (width > this.maxWidth || height > this.maxHeight) {
      throw new PayloadTooLargeException(
        'The uploaded image dimensions exceed the supported limits.',
      );
    }

    if (width * height > this.maxPixelCount) {
      throw new PayloadTooLargeException(
        'The uploaded image pixel count exceeds the supported limits.',
      );
    }
  }

  private static assertFrameCount(frameCount: number | undefined): void {
    if ((frameCount ?? 1) > this.maxFrameCount) {
      throw new UnsupportedMediaTypeException(
        'Animated or multi-frame images are not supported.',
      );
    }
  }
}
