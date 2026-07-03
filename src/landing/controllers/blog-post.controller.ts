import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { BlogPostService } from '../services/blog-post.service';
import { CreateBlogPostDto, UpdateBlogPostDto } from '../dtos/blog-post.dto';
import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';

@ApiTags('Landing - Blog')
@Controller('landing/blog')
export class BlogPostController {
  constructor(private readonly blogPostService: BlogPostService) {}

  @Get()
  @ApiOperation({ summary: 'Get all published blog posts (public)' })
  findPublished() {
    return this.blogPostService.findPublished();
  }

  @Get('all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get all blog posts including drafts (admin)' })
  findAll() {
    return this.blogPostService.findAll();
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get a published blog post by slug (public)' })
  findBySlug(@Param('slug') slug: string) {
    return this.blogPostService.findBySlug(slug);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a blog post (admin)' })
  create(@Body() dto: CreateBlogPostDto) {
    return this.blogPostService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update a blog post (admin)' })
  update(@Param('id') id: string, @Body() dto: UpdateBlogPostDto) {
    return this.blogPostService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete a blog post (admin)' })
  remove(@Param('id') id: string) {
    return this.blogPostService.remove(id);
  }
}
