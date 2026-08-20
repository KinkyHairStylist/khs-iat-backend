import { ConfigService } from '@nestjs/config';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

export const initializeFirebase = (configService: ConfigService) => {
  if (getApps().length === 0) {
    const privateKey = configService.get<string>('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n');
    const projectId = configService.get<string>('FIREBASE_PROJECT_ID');
    const storageBucket = configService.get<string>('FIREBASE_STORAGE_BUCKET') || `${projectId}.appspot.com`;
    
    initializeApp({
      credential: cert({
        projectId,
        clientEmail: configService.get<string>('FIREBASE_CLIENT_EMAIL'),
        privateKey: privateKey,
      }),
      storageBucket,
    });
  }
  return getStorage().bucket();
};