import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Story } from '../entities/story.entity';
import { CreateStoryDto, UpdateStoryDto } from '../dtos/story.dto';

@Injectable()
export class StoryService {
  constructor(
    @InjectRepository(Story)
    private readonly storyRepo: Repository<Story>,
  ) {}

  async create(dto: CreateStoryDto): Promise<Story> {
    const story = this.storyRepo.create(dto);
    return this.storyRepo.save(story);
  }

  async findPublished(): Promise<Story[]> {
    return this.storyRepo.find({
      where: { isPublished: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findAll(): Promise<Story[]> {
    return this.storyRepo.find({ order: { createdAt: 'DESC' } });
  }

  async update(id: string, dto: UpdateStoryDto): Promise<Story> {
    const story = await this.storyRepo.findOne({ where: { id } });
    if (!story) throw new NotFoundException('Story not found');
    Object.assign(story, dto);
    return this.storyRepo.save(story);
  }

  async remove(id: string): Promise<void> {
    const story = await this.storyRepo.findOne({ where: { id } });
    if (!story) throw new NotFoundException('Story not found');
    await this.storyRepo.remove(story);
  }
}
