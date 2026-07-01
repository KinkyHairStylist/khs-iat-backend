import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  ClassSerializerInterceptor,
  Request,
  ParseUUIDPipe,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';

import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { RolesGuard } from 'src/middleware/roles.guard';
import { FavoriteServiceService } from '../services/favorite-service.service';
import {
  AddFavoriteDto,
  FavoriteResponseDto,
  FavoriteWithServiceDto,
} from '../dtos/favorite-service.dto';

@ApiTags('Customer Favorites')
@Controller('user/favorites')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(ClassSerializerInterceptor)
export class FavoriteServiceController {
  constructor(private readonly favoriteService: FavoriteServiceService) {}

  /**
   * Add a service to favorites
   * POST /user/favorites
   */
  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @ApiOperation({ summary: 'Add a service to user favorites' })
  @ApiResponse({
    status: 201,
    description: 'Service added to favorites successfully',
    type: FavoriteResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Service or User not found' })
  @ApiResponse({ status: 409, description: 'Service already in favorites' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async addFavorite(@Request() req: any, @Body() dto: AddFavoriteDto) {
    return this.favoriteService.addFavorite(req.user.id, dto.serviceId);
  }

  /**
   * Get all favorites for the authenticated user
   * GET /user/favorites
   */
  @Get()
  @ApiOperation({ summary: 'Get all favorite services for the authenticated user' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({
    status: 200,
    description: 'List of favorite services returned successfully',
    type: [FavoriteWithServiceDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getUserFavorites(
    @Request() req: any,
    @Query() query: any,
  ): Promise<{ data: any[]; total: number; page: number; limit: number }> {
    const options = {
      page: parseInt(query.page) || 1,
      limit: parseInt(query.limit) || 20,
    };
    const result = await this.favoriteService.getUserFavorites(req.user.id, options);
    return { success: true, ...result };
  }

  /**
   * Get count of user's favorites
   * GET /user/favorites/count
   */
  @Get('count')
  @ApiOperation({ summary: 'Get the count of favorite services for the authenticated user' })
  @ApiResponse({
    status: 200,
    description: 'Count of favorite services',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getFavoritesCount(@Request() req: any): Promise<{ count: number }> {
    const count = await this.favoriteService.getFavoritesCount(req.user.id);
    return { count };
  }

  /**
   * Check if a service is in user's favorites
   * GET /user/favorites/check/:serviceId
   */
  @Get('check/:serviceId')
  @ApiOperation({ summary: 'Check if a service is in user favorites' })
  @ApiParam({
    name: 'serviceId',
    type: String,
    description: 'The UUID of the service to check',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns whether the service is favorited',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async checkIsFavorite(
    @Request() req: any,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
  ): Promise<{ isFavorite: boolean }> {
    const isFavorite = await this.favoriteService.isFavorite(req.user.id, serviceId);
    return { isFavorite };
  }

  /**
   * Remove a service from favorites by service ID
   * DELETE /user/favorites/service/:serviceId
   */
  @Delete('service/:serviceId')
  @ApiOperation({ summary: 'Remove a service from favorites by service ID' })
  @ApiParam({
    name: 'serviceId',
    type: String,
    description: 'The UUID of the service to remove from favorites',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Service removed from favorites successfully',
  })
  @ApiResponse({ status: 404, description: 'Service not found in favorites' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async removeFavoriteByServiceId(
    @Request() req: any,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
  ) {
    await this.favoriteService.removeFavorite(req.user.id, serviceId);
    return { success: true, message: 'Service removed from favorites successfully' };
  }

  /**
   * Remove a service from favorites by favorite ID
   * DELETE /user/favorites/:favoriteId
   */
  @Delete(':favoriteId')
  @ApiOperation({ summary: 'Remove a service from favorites by favorite entry ID' })
  @ApiParam({
    name: 'favoriteId',
    type: String,
    description: 'The UUID of the favorite entry to remove',
    example: 'f1e2d3c4-b5a6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Service removed from favorites successfully',
  })
  @ApiResponse({ status: 404, description: 'Favorite not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async removeFavoriteById(
    @Request() req: any,
    @Param('favoriteId', ParseUUIDPipe) favoriteId: string,
  ) {
    await this.favoriteService.removeFavoriteById(req.user.id, favoriteId);
    return { success: true, message: 'Service removed from favorites successfully' };
  }
}