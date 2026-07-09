// generate-referral.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from "../app.module";
import { ReferralService } from "./services/referral.service";

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const referralService = app.get(ReferralService);

  const userId = process.argv[2]; // e.g. passed via terminal argument
  if (!userId) {
    console.error('❌ Please provide a user UUID. Example: pnpm referral 00e00e72-9b2f-4a17-afa5-6567e02a7215');
    process.exit(1);
  }

  try {
    const code = await referralService.ensureReferralCode(userId);
      } catch (error) {
    console.error('❌ Error generating referral code:', error.message);
  }

  await app.close();
}

bootstrap();
