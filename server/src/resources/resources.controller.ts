import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ResourceType } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../common/rate-limit/rate-limit.guard';
import type { AuthContext } from '../auth/auth.types';
import {
  CreateFolderDto,
  FolderPathItemDto,
  ListChildrenQueryDto,
  ListFoldersQueryDto,
  MoveResourceDto,
  ReorderResourceDto,
  ResourceEntityDto,
  ResourcePageDto,
  ResourceTreeNodeDto,
  SearchResourcesDto,
  UpdateResourceDto,
} from './resources.dto';
import { ResourceAccessService } from './resource-access.service';
import { ResourceFileService } from './resource-file.service';
import { ResourceMutationService } from './resource-mutation.service';
import { ResourceQueryService } from './resource-query.service';

@ApiTags('resources')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('resources')
export class ResourcesController {
  constructor(
    private readonly resourceAccessService: ResourceAccessService,
    private readonly resourceQueryService: ResourceQueryService,
    private readonly resourceMutationService: ResourceMutationService,
    private readonly resourceFileService: ResourceFileService,
  ) {}

  @Get('children')
  @UseGuards(AuthGuard, RateLimitGuard)
  @RateLimit({ key: 'children' })
  @ApiOperation({ summary: 'List accessible resources for a parent folder.' })
  @ApiOkResponse({ type: ResourcePageDto })
  async listChildren(
    @Query() query: ListChildrenQueryDto,
    @CurrentUser() authContext: AuthContext,
  ): Promise<ResourcePageDto> {
    return this.resourceQueryService.listChildren(authContext, query);
  }

  @Get('shared')
  @UseGuards(AuthGuard, RateLimitGuard)
  @RateLimit({ key: 'children' })
  @ApiOperation({ summary: 'List resources shared with the current user.' })
  @ApiOkResponse({ type: ResourcePageDto })
  async listShared(
    @Query() query: ListChildrenQueryDto,
    @CurrentUser() authContext: AuthContext,
  ): Promise<ResourcePageDto> {
    return this.resourceQueryService.listSharedResources(authContext, query);
  }

  @Get('folders')
  @UseGuards(AuthGuard, RateLimitGuard)
  @RateLimit({ key: 'children' })
  @ApiOperation({ summary: 'List accessible folders for move dialogs.' })
  @ApiOkResponse({ type: ResourcePageDto })
  async listFolders(
    @Query() query: ListFoldersQueryDto,
    @CurrentUser() authContext: AuthContext,
  ): Promise<ResourcePageDto> {
    return this.resourceQueryService.listFolderPicker(authContext, query);
  }

  @Get('path/:folderId')
  @ApiOperation({ summary: 'Return the breadcrumb path for a folder.' })
  @ApiOkResponse({ type: [FolderPathItemDto] })
  async getFolderPath(
    @Param('folderId') folderId: string,
    @CurrentUser() authContext: AuthContext,
  ): Promise<FolderPathItemDto[]> {
    return this.resourceQueryService.getFolderPath(authContext, folderId);
  }

  @Get('search')
  @UseGuards(AuthGuard, RateLimitGuard)
  @RateLimit({ key: 'search' })
  @ApiOperation({ summary: 'Search accessible resources by name.' })
  @ApiOkResponse({ type: ResourcePageDto })
  async searchResources(
    @Query() query: SearchResourcesDto,
    @CurrentUser() authContext: AuthContext,
  ): Promise<ResourcePageDto> {
    return this.resourceQueryService.searchResources(authContext, query);
  }

  @Get(':id/file')
  @ApiOperation({
    summary: 'Serve an original file for an authorized resource.',
  })
  @ApiOkResponse({ description: 'Raw file binary.' })
  async serveFile(
    @Param('id') resourceId: string,
    @CurrentUser() authContext: AuthContext,
    @Res() res: Response,
  ): Promise<void> {
    const descriptor = await this.resourceAccessService.assertReadableResource(
      authContext.userId,
      resourceId,
    );

    if (descriptor.resource.type !== ResourceType.FILE) {
      throw new NotFoundException('File not found.');
    }

    return this.resourceFileService.streamResourceFile(
      descriptor.resource,
      false,
      res,
    );
  }

  @Get(':id/file/compressed')
  @ApiOperation({
    summary: 'Serve a compressed file for an authorized resource.',
  })
  @ApiOkResponse({ description: 'Raw compressed file binary.' })
  async serveCompressedFile(
    @Param('id') resourceId: string,
    @CurrentUser() authContext: AuthContext,
    @Res() res: Response,
  ): Promise<void> {
    const descriptor = await this.resourceAccessService.assertReadableResource(
      authContext.userId,
      resourceId,
    );

    if (descriptor.resource.type !== ResourceType.FILE) {
      throw new NotFoundException('Compressed file not found.');
    }

    return this.resourceFileService.streamResourceFile(
      descriptor.resource,
      true,
      res,
    );
  }

  @Post('folders')
  @ApiOperation({
    summary: 'Create a folder at root or inside another folder.',
  })
  @ApiCreatedResponse({ type: ResourceTreeNodeDto })
  async createFolder(
    @Body() payload: CreateFolderDto,
    @CurrentUser() authContext: AuthContext,
  ): Promise<ResourceTreeNodeDto> {
    return this.resourceMutationService.createFolder(payload, authContext);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update resource metadata such as name or visibility.',
  })
  @ApiOkResponse({ type: ResourceTreeNodeDto })
  async updateResource(
    @Param('id') resourceId: string,
    @Body() payload: UpdateResourceDto,
    @CurrentUser() authContext: AuthContext,
  ): Promise<ResourceTreeNodeDto> {
    return this.resourceMutationService.updateResource(
      resourceId,
      payload,
      authContext,
    );
  }

  @Patch(':id/reorder')
  @ApiOperation({ summary: 'Reorder a resource within the same parent.' })
  @ApiOkResponse({ type: ResourceTreeNodeDto })
  async reorderResource(
    @Param('id') resourceId: string,
    @Body() payload: ReorderResourceDto,
    @CurrentUser() authContext: AuthContext,
  ): Promise<ResourceTreeNodeDto> {
    return this.resourceMutationService.reorderResource(
      resourceId,
      payload,
      authContext,
    );
  }

  @Patch(':id/move')
  @ApiOperation({ summary: 'Move a resource to another folder or the root.' })
  @ApiOkResponse({ type: ResourceTreeNodeDto })
  async moveResource(
    @Param('id') resourceId: string,
    @Body() payload: MoveResourceDto,
    @CurrentUser() authContext: AuthContext,
  ): Promise<ResourceTreeNodeDto> {
    return this.resourceMutationService.moveResource(
      resourceId,
      payload,
      authContext,
    );
  }

  @Post(':id/clone')
  @ApiOperation({ summary: 'Clone a resource and its descendants.' })
  @ApiCreatedResponse({ type: ResourceTreeNodeDto })
  async cloneResource(
    @Param('id') resourceId: string,
    @CurrentUser() authContext: AuthContext,
  ): Promise<ResourceTreeNodeDto> {
    return this.resourceMutationService.cloneResource(resourceId, authContext);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a resource and its descendants.' })
  @ApiOkResponse({ schema: { example: { success: true } } })
  async deleteResource(
    @Param('id') resourceId: string,
    @CurrentUser() authContext: AuthContext,
  ): Promise<{ success: true }> {
    return this.resourceMutationService.deleteResource(resourceId, authContext);
  }
}
