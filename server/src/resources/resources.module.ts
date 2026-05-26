import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RedisModule } from '../common/redis/redis.module';
import { EventsModule } from '../events/events.module';
import { JobsModule } from '../jobs/jobs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { ResourceScopeCacheService } from './resource-scope-cache.service';
import { ResourceAccessService } from './resource-access.service';
import { ResourceCloneService } from './resource-clone.service';
import { ResourceFileService } from './resource-file.service';
import { ResourceMutationService } from './resource-mutation.service';
import { ResourceOrderingService } from './resource-ordering.service';
import { ResourceQueryService } from './resource-query.service';
import { ResourcesController } from './resources.controller';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    AuthModule,
    JobsModule,
    StorageModule,
    EventsModule,
  ],
  controllers: [ResourcesController],
  providers: [
    ResourceAccessService,
    ResourceScopeCacheService,
    ResourceCloneService,
    ResourceOrderingService,
    ResourceQueryService,
    ResourceMutationService,
    ResourceFileService,
  ],
  exports: [
    ResourceAccessService,
    ResourceCloneService,
    ResourceOrderingService,
    ResourceQueryService,
    ResourceMutationService,
    ResourceFileService,
  ],
})
export class ResourcesModule {}
