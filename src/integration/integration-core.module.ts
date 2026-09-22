import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Business } from 'src/business/entities/business.entity';
import { IntegrationAccessService } from './services/integration-access.service';

// Ownership checks and signed OAuth state, shared by the three integrations.
// JwtService comes from the globally registered JwtModule.
@Module({
  imports: [TypeOrmModule.forFeature([Business])],
  providers: [IntegrationAccessService],
  exports: [IntegrationAccessService],
})
export class IntegrationCoreModule {}
