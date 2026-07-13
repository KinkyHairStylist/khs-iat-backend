import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

import { ArticleService } from '../services/article.service';

@ApiTags('Help Articles')
@Controller('support/articles')
export class ArticleController {
    constructor(private readonly articleService: ArticleService) {}

    @Get(':id')
    @ApiOperation({ summary: 'Get a single help article by ID' })
    async getSingleArticle(@Param('id') id: string) {
        const article = await this.articleService.getArticleById(id);
        if (!article) throw new NotFoundException('Article not found');
        return article;
    }

    @Get()
    @ApiOperation({ summary: 'Get all help articles' })
    async getAllArticles() {
        return this.articleService.getAllArticles();
    }
}