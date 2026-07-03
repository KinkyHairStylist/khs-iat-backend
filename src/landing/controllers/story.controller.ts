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
import { StoryService } from '../services/story.service';
import { CreateStoryDto, UpdateStoryDto } from '../dtos/story.dto';
import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';

@ApiTags('Landing - Stories')
@Controller('landing/stories')
export class StoryController {
  constructor(private readonly storyService: StoryService) {}

  @Get()
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
