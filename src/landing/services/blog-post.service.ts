import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BlogPost } from '../entities/blog-post.entity';
import { CreateBlogPostDto, UpdateBlogPostDto } from '../dtos/blog-post.dto';

@Injectable()
export class BlogPostService {
  constructor(
    @InjectRepository(BlogPost)
    private readonly blogPostRepo: Repository<BlogPost>,
  ) {}

  async create(dto: CreateBlogPostDto): Promise<BlogPost> {
    const post = this.blogPostRepo.create({
      ...dto,
      publishedAt: dto.isPublished ? new Date() : null,
    });
    return this.blogPostRepo.save(post);
  }

  async findPublished(): Promise<BlogPost[]> {
    return this.blogPostRepo.find({
      where: { isPublished: true },
      order: { publishedAt: 'DESC' },
    });
  }

  async findAll(): Promise<BlogPost[]> {
    return this.blogPostRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findBySlug(slug: string): Promise<BlogPost> {
    const post = await this.blogPostRepo.findOne({ where: { slug, isPublished: true } });
    if (!post) throw new NotFoundException('Blog post not found');
    return post;
  }

  async update(id: string, dto: UpdateBlogPostDto): Promise<BlogPost> {
    const post = await this.blogPostRepo.findOne({ where: { id } });
    if (!post) throw new NotFoundException('Blog post not found');

    if (dto.isPublished && !post.isPublished) {
      dto['publishedAt'] = new Date();
    }

    Object.assign(post, dto);
    return this.blogPostRepo.save(post);
  }

  async remove(id: string): Promise<void> {
    const post = await this.blogPostRepo.findOne({ where: { id } });
    if (!post) throw new NotFoundException('Blog post not found');
    await this.blogPostRepo.remove(post);
  }
}
