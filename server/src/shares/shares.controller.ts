import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import type { AuthContext } from '../auth/auth.types';
import {
  ShareInvitationResponseDto,
  CreateShareInvitationDto,
} from './shares.dto';
import { ShareInvitationService } from './share-invitation.service';

@ApiTags('shares')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('shares')
export class SharesController {
  constructor(private readonly shareInvitationService: ShareInvitationService) {}

  @Post('invitations')
  @ApiOperation({ summary: 'Create a share invitation for a resource.' })
  @ApiCreatedResponse({ type: ShareInvitationResponseDto })
  async createInvitation(
    @Body() payload: CreateShareInvitationDto,
    @CurrentUser() authContext: AuthContext,
  ): Promise<ShareInvitationResponseDto> {
    return this.shareInvitationService.createInvitation(payload, authContext);
  }

  @Get('resource/:resourceId')
  @ApiOperation({ summary: 'List invitations for a resource.' })
  @ApiOkResponse({ type: [ShareInvitationResponseDto] })
  async listInvitations(
    @Param('resourceId') resourceId: string,
    @CurrentUser() authContext: AuthContext,
  ): Promise<ShareInvitationResponseDto[]> {
    return this.shareInvitationService.listInvitations(resourceId, authContext);
  }

  @Post('invitations/:id/accept')
  @ApiOperation({
    summary: 'Accept a share invitation for the authenticated user.',
  })
  @ApiOkResponse({ type: ShareInvitationResponseDto })
  async acceptInvitation(
    @Param('id') invitationId: string,
    @CurrentUser() authContext: AuthContext,
  ): Promise<ShareInvitationResponseDto> {
    return this.shareInvitationService.acceptInvitation(
      invitationId,
      authContext,
    );
  }

  @Delete('invitations/:id')
  @ApiOperation({ summary: 'Revoke a share invitation.' })
  @ApiOkResponse({ type: ShareInvitationResponseDto })
  async revokeInvitation(
    @Param('id') invitationId: string,
    @CurrentUser() authContext: AuthContext,
  ): Promise<ShareInvitationResponseDto> {
    return this.shareInvitationService.revokeInvitation(
      invitationId,
      authContext,
    );
  }
}
