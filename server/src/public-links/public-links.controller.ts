import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../common/rate-limit/rate-limit.guard';
import {
  CreatePublicLinkDto,
  PublicLinkResourceNodeDto,
  PublicLinkResponseDto,
} from './public-links.dto';
import { PublicLinkService } from './public-link.service';

@ApiTags('public-links')
@Controller('public-links')
export class PublicLinksController {
  constructor(private readonly publicLinkService: PublicLinkService) {}

  @Post()
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a public link for a resource.' })
  @ApiCreatedResponse({ type: PublicLinkResponseDto })
  async createPublicLink(
    @Body() payload: CreatePublicLinkDto,
    @CurrentUser() authContext: AuthContext,
  ): Promise<PublicLinkResponseDto> {
    return this.publicLinkService.createPublicLink(
      payload.resourceId,
      authContext,
    );
  }

  @Get('resource/:resourceId')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Return the current active public link for a resource.' })
  @ApiOkResponse({ type: PublicLinkResponseDto, nullable: true })
  async getActivePublicLink(
    @Param('resourceId') resourceId: string,
    @CurrentUser() authContext: AuthContext,
  ): Promise<PublicLinkResponseDto | null> {
    return this.publicLinkService.getActivePublicLink(resourceId, authContext);
  }

  @Get(':token')
  @UseGuards(RateLimitGuard)
  @RateLimit({ key: 'publicLinks' })
  @ApiOperation({
    summary: 'Resolve a public link and return the resource subtree.',
  })
  @ApiOkResponse({ type: PublicLinkResourceNodeDto })
  async getPublicLink(
    @Param('token') token: string,
  ): Promise<PublicLinkResourceNodeDto> {
    return this.publicLinkService.resolvePublicLink(token);
  }

  @Get(':token/resources/:resourceId/file')
  @UseGuards(RateLimitGuard)
  @RateLimit({ key: 'publicLinks' })
  @ApiOperation({ summary: 'Stream a public-link file resource.' })
  @ApiOkResponse({ description: 'Raw file binary.' })
  async streamPublicFile(
    @Param('token') token: string,
    @Param('resourceId') resourceId: string,
    @Res() res: Response,
  ): Promise<void> {
    return this.publicLinkService.streamPublicFile(
      token,
      resourceId,
      false,
      res,
    );
  }

  @Get(':token/resources/:resourceId/file/compressed')
  @UseGuards(RateLimitGuard)
  @RateLimit({ key: 'publicLinks' })
  @ApiOperation({ summary: 'Stream a compressed public-link file resource.' })
  @ApiOkResponse({ description: 'Raw compressed file binary.' })
  async streamPublicCompressedFile(
    @Param('token') token: string,
    @Param('resourceId') resourceId: string,
    @Res() res: Response,
  ): Promise<void> {
    return this.publicLinkService.streamPublicFile(
      token,
      resourceId,
      true,
      res,
    );
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke a public link.' })
  @ApiOkResponse({ type: PublicLinkResponseDto })
  async revokePublicLink(
    @Param('id') publicLinkId: string,
    @CurrentUser() authContext: AuthContext,
  ): Promise<PublicLinkResponseDto> {
    return this.publicLinkService.revokePublicLink(publicLinkId, authContext);
  }
}
