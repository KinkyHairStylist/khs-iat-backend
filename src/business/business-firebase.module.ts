import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { initializeFirebase } from './config/firebase.config';
import { BusinessFirebaseService } from './services/business-firebase.service';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'FIREBASE_STORAGE_BUCKET',
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => initializeFirebase(configService),
    },
    BusinessFirebaseService,
  ],
  exports: [BusinessFirebaseService],
})
export class BusinessFirebaseModule {}