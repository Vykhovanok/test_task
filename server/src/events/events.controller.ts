import { Controller, MessageEvent, Sse, UseGuards } from '@nestjs/common';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../common/rate-limit/rate-limit.guard';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Observable } from 'rxjs';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import type { AuthContext } from '../auth/auth.types';
import { EventsStreamService } from './events-stream.service';

@ApiTags('events')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('events')
export class EventsController {
  constructor(private readonly eventsStreamService: EventsStreamService) {}

  @Sse('stream')
  @UseGuards(RateLimitGuard)
  @RateLimit({ key: 'events' })
  @ApiOperation({ summary: 'Subscribe to resource change events for the current user.' })
  stream(@CurrentUser() authContext: AuthContext): Observable<MessageEvent> {
    return this.eventsStreamService.createUserStream(authContext.userId);
  }
}
