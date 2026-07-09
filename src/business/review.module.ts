import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientSchema } from './entities/client.entity';
import { Review } from './entities/review.entity';
import { ClientModule } from './client.module';
import { ReviewController } from './controllers/review.controller';
import { ReviewService } from './services/review.service';
import { User } from 'src/all_user_entities/user.entity';
import { UserModule } from 'src/user/modules/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Review, ClientSchema, User]),
    ClientModule,
    UserModule,
  ],
  controllers: [ReviewController],
  providers: [ReviewService],
  exports: [ReviewService],
})
export class ReviewModule {}
