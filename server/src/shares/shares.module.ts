import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ResourcesModule } from '../resources/resources.module';
import { SharesController } from './shares.controller';
import { ShareInvitationService } from './share-invitation.service';

@Module({
  imports: [PrismaModule, AuthModule, ResourcesModule],
  controllers: [SharesController],
  providers: [ShareInvitationService],
})
export class SharesModule {}
