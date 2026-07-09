import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { Express } from 'express';
import { ArticleSection } from 'src/all_user_entities/article.entity'; // adjust path if needed

export class CreateArticleDto {
  @ApiProperty({
    enum: ArticleSection,
    example: ArticleSection.GET_STARTED,
    description: 'Section of the article (get_started, payment_method, booking_management)',
  })
  @IsEnum(ArticleSection)
  section: ArticleSection;

  @ApiProperty({
    example: 'My First Article',
    description: 'Title of the article',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    example: 'This is the content of the article.',
    description: 'Main body of the article',
  })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Optional file (image or document)',
  })
  @IsOptional()
  file?: Express.Multer.File;
}
