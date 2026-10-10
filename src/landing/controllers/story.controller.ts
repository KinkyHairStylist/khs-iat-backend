import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { StoryService } from '../services/story.service';
import { Public } from 'src/business/middlewares/public.decorator';

@ApiTags('Landing - Stories')
@Controller('landing/stories')
export class StoryController {
  constructor(private readonly storyService: StoryService) {}

  // Managing this content (drafts, create, edit, delete, uploads) moved to
  // khs-iat-staff-be. Here those routes only checked for a login, so any
  // customer account could use them. Only the public routes remain.

  @Get()
  @Public()
  @ApiOperation({ summary: 'Get all published stories (public)' })
  findPublished() {
    return this.storyService.findPublished();
  }
}
