import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { FavoriteService } from '../user_entities/favorite-service.entity';
import { Service } from 'src/business/entities/service.entity';
import { User } from 'src/all_user_entities/user.entity';

@Injectable()
export class FavoriteServiceService {
  constructor(
    @InjectRepository(FavoriteService)
    private readonly favoriteRepo: Repository<FavoriteService>,

    @InjectRepository(Service)
    private readonly serviceRepo: Repository<Service>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * Add a service to user's favorites
   */
  async addFavorite(userId: string, serviceId: string): Promise<FavoriteService> {
    // Check if user exists
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with id "${userId}" not found`);
    }

    // Check if service exists
    const service = await this.serviceRepo.findOne({
      where: { id: serviceId },
      relations: ['business'],
    });
    if (!service) {
      throw new NotFoundException(`Service with id "${serviceId}" not found`);
    }

    // Check if already in favorites
    const existingFavorite = await this.favoriteRepo.findOne({
      where: { userId, serviceId },
    });
    if (existingFavorite) {
      throw new ConflictException('Service is already in your favorites');
    }

    // Create and save the favorite
    const favorite = this.favoriteRepo.create({
      userId,
      serviceId,
    });

    return this.favoriteRepo.save(favorite);
  }

  /**
   * Get all favorites for a user with pagination
   */
  async getUserFavorites(
    userId: string,
    options: { page?: number; limit?: number } = {},
  ): Promise<{ data: any[]; total: number; page: number; limit: number }> {
    const { page = 1, limit = 20 } = options;
    const skip = (page - 1) * limit;

    const [favorites, total] = await this.favoriteRepo.findAndCount({
      where: { userId },
      relations: ['service'],
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    // Transform the data to include service details
    const data = favorites.map((fav) => ({
      id: fav.id,
      service: fav.service,
      createdAt: fav.createdAt,
    }));

    return { data, total, page, limit };
  }

  /**
   * Remove a service from user's favorites
   */
  async removeFavorite(userId: string, serviceId: string): Promise<{ message: string }> {
    const favorite = await this.favoriteRepo.findOne({
      where: { userId, serviceId },
    });

    if (!favorite) {
      throw new NotFoundException('Service not found in your favorites');
    }

    await this.favoriteRepo.remove(favorite);

    return { message: 'Service removed from favorites successfully' };
  }

  /**
   * Remove a favorite by its ID
   */
  async removeFavoriteById(
    userId: string,
    favoriteId: string,
  ): Promise<{ message: string }> {
    const favorite = await this.favoriteRepo.findOne({
      where: { id: favoriteId, userId },
    });

    if (!favorite) {
      throw new NotFoundException('Favorite not found');
    }

    await this.favoriteRepo.remove(favorite);

    return { message: 'Service removed from favorites successfully' };
  }

  /**
   * Check if a service is in user's favorites
   */
  async isFavorite(userId: string, serviceId: string): Promise<boolean> {
    const favorite = await this.favoriteRepo.findOne({
      where: { userId, serviceId },
    });
    return !!favorite;
  }

  /**
   * Get count of user's favorites
   */
  async getFavoritesCount(userId: string): Promise<number> {
    return this.favoriteRepo.count({ where: { userId } });
  }
}