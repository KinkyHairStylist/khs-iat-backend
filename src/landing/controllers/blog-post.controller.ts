import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { BlogPostService } from '../services/blog-post.service';
import { CreateBlogPostDto, UpdateBlogPostDto } from '../dtos/blog-post.dto';
import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { Public } from 'src/business/middlewares/public.decorator';
import { CloudinaryService } from 'src/user/services/cloudinary.service';
import { fileUploadOptions } from 'src/middleware/file-upload.middleware';

@ApiTags('Landing - Blog')
@Controller('landing/blog')
export class BlogPostController {
  constructor(
    private readonly blogPostService: BlogPostService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @Get()
  @Public()
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
  @Public()
  @ApiOperation({ summary: 'Get a published blog post by slug (public)' })
  findBySlug(@Param('slug') slug: string) {
    return this.blogPostService.findBySlug(slug);
  }

  @Post('upload-image')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @UseInterceptors(FileInterceptor('file', fileUploadOptions()))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a blog post cover image (admin)' })
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    const url = await this.cloudinaryService.uploadFile(file);
    return { success: true, data: { url } };
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
