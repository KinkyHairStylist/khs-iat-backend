import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Article } from '../../all_user_entities/article.entity';
import { CreateArticleDto } from '../dtos/create-article.dto';
import { User } from '../../all_user_entities/user.entity';
import { FirebaseStorageService } from 'src/shared/services/firebase-storage.service';

@Injectable()
export class ArticleService {
  constructor(
    @InjectRepository(Article)
    private readonly articleRepo: Repository<Article>,
    private readonly firebaseStorageService: FirebaseStorageService,
  ) {}

  async createArticle(
    dto: CreateArticleDto,
    user: User,
    file?: Express.Multer.File,
  ): Promise<Article> {
    let fileUrl: string | undefined;
    if (file) {
      const uploaded = await this.firebaseStorageService.uploadFromBuffer(
        file,
        'KHS/admin/articles',
      );
      fileUrl = uploaded.imageUrl;
    }

    const article = this.articleRepo.create({
      section: dto.section,
      title: dto.title,
      content: dto.content,
      fileUrl,
      author: user,
    });
    return this.articleRepo.save(article);
  }

  async getAllArticles(): Promise<Article[]> {
    return this.articleRepo.find();
  }
}
