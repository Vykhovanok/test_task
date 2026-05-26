import {
  Body,
  Controller,
  ForbiddenException,
  Logger,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Prisma, ProcessingStatus, ResourceType, Visibility } from '@prisma/client';
import type { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../common/rate-limit/rate-limit.guard';
import { ResourceProcessingService } from '../jobs/resource-processing.service';
import { PrismaService } from '../prisma/prisma.service';
import { ResourceTreeNodeDto } from '../resources/resources.dto';
import { ResourceAccessService } from '../resources/resource-access.service';
import { ResourceOrderingService } from '../resources/resource-ordering.service';
import {
  RESOURCE_WITH_PERMISSIONS_INCLUDE,
  type ResourceWithPermissions,
} from '../resources/resources.types';
import { mapDescriptorToDto } from '../resources/resources.utils';
import { StoragePathService } from '../storage/storage-path.service';
import { createMissingFileException } from './multer.config';
import { sanitizeDisplayFilename } from './filename.utils';
import { ImageContentPolicy } from './image-content.policy';
import { VideoContentPolicy } from './video-content.policy';
import { UploadImageDto } from './uploads.dto';

@ApiTags('uploads')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('uploads')
export class UploadsController {
  private readonly logger = new Logger(UploadsController.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly resourceAccessService: ResourceAccessService,
    private readonly resourceOrderingService: ResourceOrderingService,
    private readonly resourceProcessingService: ResourceProcessingService,
    private readonly storagePathService: StoragePathService,
  ) {}

  @Post('image')
  @UseGuards(AuthGuard, RateLimitGuard)
  @RateLimit({ key: 'uploads' })
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload an image into the resource tree.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        parentId: { type: 'string', nullable: true },
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @ApiCreatedResponse({ type: ResourceTreeNodeDto })
  async uploadImage(
    @Body() payload: UploadImageDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() authContext: AuthContext,
  ): Promise<ResourceTreeNodeDto> {
    if (!file) {
      throw createMissingFileException();
    }

    ImageContentPolicy.assertSize(file.size);

    const stagedRelativePath = this.storagePathService.buildStagingRelativePath(
      file.filename,
    );
    const stagedAbsolutePath = this.storagePathService.resolveStagedAbsolutePath(
      file.filename,
    );
    let finalAbsolutePath: string | null = null;
    let createdResourceId: string | null = null;

    try {
      await this.storagePathService.ensureManagedDirectories();

      const inspection = await ImageContentPolicy.inspectFile(
        stagedAbsolutePath,
        file.mimetype,
        file.originalname,
      );
      const sanitizedFilename = sanitizeDisplayFilename(
        file.originalname,
        inspection.normalizedExtension,
      );

      const storedFilename = this.storagePathService.createManagedFilename(
        inspection.normalizedExtension,
      );
      const storagePath = this.storagePathService.buildStoredImagePath(
        storedFilename,
      );

      finalAbsolutePath =
        this.storagePathService.resolveOriginalAbsolutePath(storagePath);

      const createdResource = await this.resourceAccessService.handleSerializationFailure(
        () =>
          this.prismaService.$transaction(
            async (transaction) => {
              let parent: ResourceWithPermissions | null = null;

              if (payload.parentId) {
                const parentDescriptor =
                  await this.resourceAccessService.assertEditableResource(
                    authContext.userId,
                    payload.parentId,
                    transaction,
                  );
                parent = parentDescriptor.resource;

                if (parent.type !== ResourceType.FOLDER) {
                  throw new ForbiddenException(
                    'Images can only be uploaded into folders.',
                  );
                }
              }

              await this.resourceOrderingService.lockParentScopes(
                [parent?.id ?? null],
                transaction,
              );
              const sortOrder =
                await this.resourceOrderingService.allocateNextSortOrder(
                  parent?.id ?? null,
                  transaction,
                );

              return transaction.resource.create({
                data: {
                  name: sanitizedFilename,
                  type: ResourceType.FILE,
                  ownerId: authContext.userId,
                  parentId: parent?.id ?? null,
                  visibility: Visibility.PRIVATE,
                  mimeType: inspection.normalizedMimeType,
                  originalFilename: sanitizedFilename,
                  storagePath,
                  size: file.size,
                  processingStatus: ProcessingStatus.PENDING,
                  sortOrder,
                },
                ...RESOURCE_WITH_PERMISSIONS_INCLUDE,
              });
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
          ),
      );

      createdResourceId = createdResource.id;

      await this.storagePathService.moveFile(
        stagedAbsolutePath,
        finalAbsolutePath,
      );

      await this.resourceProcessingService.enqueueCompression({
        resourceId: createdResource.id,
        storagePath,
        stagedPath: stagedRelativePath,
        mimeType: inspection.normalizedMimeType,
      });

      return mapDescriptorToDto({
        resource: createdResource,
        effectiveRole: 'owner',
        inheritedAccess: false,
        permissionRole: null,
      });
    } catch (primaryError) {
      await this.rollbackUpload({
        createdResourceId,
        finalAbsolutePath,
        stagedAbsolutePath,
        primaryError,
      });
      throw primaryError;
    }
  }

  @Post('video')
  @UseGuards(AuthGuard, RateLimitGuard)
  @RateLimit({ key: 'uploads' })
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload a video into the resource tree.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        parentId: { type: 'string', nullable: true },
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @ApiCreatedResponse({ type: ResourceTreeNodeDto })
  async uploadVideo(
    @Body() payload: UploadImageDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() authContext: AuthContext,
  ): Promise<ResourceTreeNodeDto> {
    if (!file) {
      throw createMissingFileException('video');
    }

    VideoContentPolicy.assertSize(file.size);

    const stagedRelativePath = this.storagePathService.buildStagingRelativePath(
      file.filename,
    );
    const stagedAbsolutePath = this.storagePathService.resolveStagedAbsolutePath(
      file.filename,
    );
    let finalAbsolutePath: string | null = null;
    let createdResourceId: string | null = null;

    try {
      await this.storagePathService.ensureManagedDirectories();

      const inspection = VideoContentPolicy.inspectDeclaredFile(
        file.mimetype,
        file.originalname,
      );
      const sanitizedFilename = sanitizeDisplayFilename(
        file.originalname,
        inspection.normalizedExtension,
      );

      const storedFilename = this.storagePathService.createManagedFilename(
        inspection.normalizedExtension,
      );
      const storagePath = this.storagePathService.buildStoredImagePath(
        storedFilename,
      );

      finalAbsolutePath =
        this.storagePathService.resolveOriginalAbsolutePath(storagePath);

      const createdResource = await this.resourceAccessService.handleSerializationFailure(
        () =>
          this.prismaService.$transaction(
            async (transaction) => {
              let parent: ResourceWithPermissions | null = null;

              if (payload.parentId) {
                const parentDescriptor =
                  await this.resourceAccessService.assertEditableResource(
                    authContext.userId,
                    payload.parentId,
                    transaction,
                  );
                parent = parentDescriptor.resource;

                if (parent.type !== ResourceType.FOLDER) {
                  throw new ForbiddenException(
                    'Videos can only be uploaded into folders.',
                  );
                }
              }

              await this.resourceOrderingService.lockParentScopes(
                [parent?.id ?? null],
                transaction,
              );
              const sortOrder =
                await this.resourceOrderingService.allocateNextSortOrder(
                  parent?.id ?? null,
                  transaction,
                );

              return transaction.resource.create({
                data: {
                  name: sanitizedFilename,
                  type: ResourceType.FILE,
                  ownerId: authContext.userId,
                  parentId: parent?.id ?? null,
                  visibility: Visibility.PRIVATE,
                  mimeType: inspection.normalizedMimeType,
                  originalFilename: sanitizedFilename,
                  storagePath,
                  size: file.size,
                  processingStatus: ProcessingStatus.PENDING,
                  sortOrder,
                },
                ...RESOURCE_WITH_PERMISSIONS_INCLUDE,
              });
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
          ),
      );

      createdResourceId = createdResource.id;

      await this.storagePathService.moveFile(
        stagedAbsolutePath,
        finalAbsolutePath,
      );

      await this.resourceProcessingService.enqueueCompression({
        resourceId: createdResource.id,
        storagePath,
        stagedPath: stagedRelativePath,
        mimeType: inspection.normalizedMimeType,
      });

      return mapDescriptorToDto({
        resource: createdResource,
        effectiveRole: 'owner',
        inheritedAccess: false,
        permissionRole: null,
      });
    } catch (primaryError) {
      await this.rollbackUpload({
        createdResourceId,
        finalAbsolutePath,
        stagedAbsolutePath,
        primaryError,
      });
      throw primaryError;
    }
  }

  private async rollbackUpload(params: {
    createdResourceId: string | null;
    finalAbsolutePath: string | null;
    stagedAbsolutePath: string;
    primaryError: unknown;
  }): Promise<void> {
    const { createdResourceId, finalAbsolutePath, stagedAbsolutePath, primaryError } =
      params;

    if (createdResourceId) {
      try {
        await this.prismaService.resource.delete({
          where: { id: createdResourceId },
        });
      } catch (cleanupError) {
        if ((cleanupError as { code?: string }).code !== 'P2025') {
          this.logger.error(
            `Failed to roll back uploaded resource record ${createdResourceId} after primary failure.`,
            { cleanupError, primaryError },
          );
        }
      }

      try {
        await this.resourceProcessingService.cleanupCompressionJob(
          createdResourceId,
        );
      } catch (cleanupError) {
        this.logger.warn(
          `Failed to cancel compression job ${createdResourceId} during upload rollback.`,
          { cleanupError, primaryError },
        );
      }
    }

    if (finalAbsolutePath) {
      await this.removeUploadedFile(finalAbsolutePath, primaryError);
    }

    await this.removeUploadedFile(stagedAbsolutePath, primaryError);
  }

  private async removeUploadedFile(
    absolutePath: string,
    primaryError: unknown,
  ): Promise<void> {
    try {
      await this.storagePathService.deleteFileIfExists(absolutePath);
    } catch (cleanupError) {
      this.logger.warn(
        `Failed to remove uploaded file ${absolutePath} during rollback; continuing.`,
        { cleanupError, primaryError },
      );
    }
  }
}
