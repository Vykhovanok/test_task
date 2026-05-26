import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ResourcesModule } from '../resources/resources.module';
import { StorageModule } from '../storage/storage.module';
import { PublicLinksController } from './public-links.controller';
import { PublicLinkService } from './public-link.service';

@Module({
  imports: [PrismaModule, AuthModule, ResourcesModule, StorageModule],
  controllers: [PublicLinksController],
  providers: [PublicLinkService],
})
export class PublicLinksModule {}
