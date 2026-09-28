import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { initializeFirebase } from '../business/config/firebase.config';
import { FirebaseStorageService } from './services/firebase-storage.service';

// Global so every module can inject FirebaseStorageService without each
// feature module importing it individually (unlike the old per-module
// BusinessFirebaseModule/BusinessCloudinaryModule pattern).
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'FIREBASE_STORAGE_BUCKET',
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => initializeFirebase(configService),
    },
    FirebaseStorageService,
  ],
  exports: [FirebaseStorageService],
})
export class FirebaseStorageModule {}
