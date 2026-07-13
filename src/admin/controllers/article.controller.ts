import { Controller, Post, Get, UseGuards, UseInterceptors, UploadedFile, Body } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBearerAuth } from '@nestjs/swagger';

import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { GetUser } from 'src/middleware/get-user.decorator';
import { User } from 'src/all_user_entities/user.entity';
import { fileUploadOptions } from 'src/middleware/file-upload.middleware';
import { CreateArticleDto } from '../dtos/create-article.dto';
import { ArticleService } from '../services/article.service';
import type { Express } from 'express';

@ApiTags('Articles')
@ApiBearerAuth('access-token')
@Controller('users/articles')
export class ArticleController {
  constructor(private readonly articleService: ArticleService) {}

  @Post('create')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', fileUploadOptions()))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Create an article (with optional file upload)' })
  async createArticle(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateArticleDto,
    @GetUser() user: User,
  ) {
    return this.articleService.createArticle(dto, user, file);
  }

  @Get()
  @ApiOperation({ summary: 'Get all articles' })
  async getAllArticles() {
    return this.articleService.getAllArticles();
  }
}
