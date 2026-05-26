import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import * as path from 'path';

export type SupportedVideoFormat = 'mp4' | 'webm' | 'quicktime';

export type VideoInspectionResult = {
  detectedFormat: SupportedVideoFormat;
  normalizedMimeType: string;
  normalizedExtension: string;
};

export class VideoContentPolicy {
  static readonly maxFileSizeInBytes = 100 * 1024 * 1024;

  private static readonly formatToMimeType = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    quicktime: 'video/quicktime',
  } satisfies Record<SupportedVideoFormat, string>;

  private static readonly formatToExtensions = {
    mp4: new Set(['.mp4', '.m4v']),
    webm: new Set(['.webm']),
    quicktime: new Set(['.mov']),
  } satisfies Record<SupportedVideoFormat, Set<string>>;

  static assertSize(fileSize: number): void {
    if (fileSize > this.maxFileSizeInBytes) {
      throw new PayloadTooLargeException(
        'The uploaded file exceeds the size limit.',
      );
    }
  }

  static inspectDeclaredFile(
    declaredMimeType: string,
    originalFilename: string,
  ): VideoInspectionResult {
    const extension = path.extname(originalFilename).toLowerCase();
    const detectedFormat = this.detectFormatFromExtension(extension);
    const normalizedMimeType = this.formatToMimeType[detectedFormat];
    const normalizedExtension =
      detectedFormat === 'quicktime' ? '.mov' : extension || '.mp4';

    if (
      declaredMimeType &&
      !declaredMimeType.startsWith('video/') &&
      declaredMimeType !== 'application/octet-stream'
    ) {
      throw new UnsupportedMediaTypeException(
        'Only MP4, WebM, and MOV videos are supported.',
      );
    }

    if (declaredMimeType.startsWith('video/') && declaredMimeType !== normalizedMimeType) {
      const allowed = new Set(Object.values(this.formatToMimeType));

      if (!allowed.has(declaredMimeType)) {
        throw new UnsupportedMediaTypeException(
          'Only MP4, WebM, and MOV videos are supported.',
        );
      }
    }

    return {
      detectedFormat,
      normalizedMimeType,
      normalizedExtension,
    };
  }

  static isSupportedDeclaredExtension(filename: string): boolean {
    const extension = path.extname(filename).toLowerCase();

    return Object.values(this.formatToExtensions).some((extensions) =>
      extensions.has(extension),
    );
  }

  private static detectFormatFromExtension(
    extension: string,
  ): SupportedVideoFormat {
    if (this.formatToExtensions.webm.has(extension)) {
      return 'webm';
    }

    if (this.formatToExtensions.quicktime.has(extension)) {
      return 'quicktime';
    }

    if (this.formatToExtensions.mp4.has(extension)) {
      return 'mp4';
    }

    throw new BadRequestException(
      'Only MP4, WebM, and MOV videos are supported.',
    );
  }
}
