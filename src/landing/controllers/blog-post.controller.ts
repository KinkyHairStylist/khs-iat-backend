import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { BlogPostService } from '../services/blog-post.service';
import { Public } from 'src/business/middlewares/public.decorator';

@ApiTags('Landing - Blog')
@Controller('landing/blog')
export class BlogPostController {
  constructor(private readonly blogPostService: BlogPostService) {}

  // Managing this content (drafts, create, edit, delete, uploads) moved to
  // khs-iat-staff-be. Here those routes only checked for a login, so any
  // customer account could use them. Only the public routes remain.

  @Get()
  @Public()
  @ApiOperation({ summary: 'Get all published blog posts (public)' })
  findPublished() {
    return this.blogPostService.findPublished();
  }

  @Get(':slug')
  @Public()
  @ApiOperation({ summary: 'Get a published blog post by slug (public)' })
  findBySlug(@Param('slug') slug: string) {
    return this.blogPostService.findBySlug(slug);
  }
}
