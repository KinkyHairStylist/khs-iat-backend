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
import { StoryService } from '../services/story.service';
import { CreateStoryDto, UpdateStoryDto } from '../dtos/story.dto';
import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { Public } from 'src/business/middlewares/public.decorator';
import { FirebaseStorageService } from 'src/shared/services/firebase-storage.service';
import { fileUploadOptions } from 'src/middleware/file-upload.middleware';

@ApiTags('Landing - Stories')
@Controller('landing/stories')
export class StoryController {
  constructor(
    private readonly storyService: StoryService,
    private readonly firebaseStorageService: FirebaseStorageService,
  ) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Get all published stories (public)' })
  findPublished() {
    return this.storyService.findPublished();
  }

  @Get('all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get all stories including unpublished (admin)' })
  findAll() {
    return this.storyService.findAll();
  }

  @Post('upload-image')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @UseInterceptors(FileInterceptor('file', fileUploadOptions()))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a story image (admin)' })
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    const { imageUrl } = await this.firebaseStorageService.uploadFromBuffer(
      file,
      'KHS/landing/stories',
    );
    return { success: true, data: { url: imageUrl } };
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a story (admin)' })
  create(@Body() dto: CreateStoryDto) {
    return this.storyService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update a story (admin)' })
  update(@Param('id') id: string, @Body() dto: UpdateStoryDto) {
    return this.storyService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete a story (admin)' })
  remove(@Param('id') id: string) {
    return this.storyService.remove(id);
  }
}
