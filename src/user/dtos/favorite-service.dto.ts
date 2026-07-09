import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsNotEmpty } from 'class-validator';

export class AddFavoriteDto {
  @ApiProperty({
    description: 'The UUID of the service to add to favorites',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsUUID()
  @IsNotEmpty()
  serviceId: string;
}

export class RemoveFavoriteDto {
  @ApiProperty({
    description: 'The UUID of the service to remove from favorites',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsUUID()
  @IsNotEmpty()
  serviceId: string;
}

export class FavoriteResponseDto {
  @ApiProperty({
    description: 'The ID of the favorite entry',
    example: 'f1e2d3c4-b5a6-7890-abcd-ef1234567890',
  })
  id: string;

  @ApiProperty({
    description: 'The ID of the user',
    example: 'u1s2e3r4-i5d6-7890-abcd-ef1234567890',
  })
  userId: string;

  @ApiProperty({
    description: 'The ID of the favorited service',
    example: 's1e2r3v4-i5c6-7890-abcd-ef1234567890',
  })
  serviceId: string;

  @ApiProperty({
    description: 'The date when the service was added to favorites',
    example: '2024-01-15T10:30:00Z',
  })
  createdAt: Date;
}

export class FavoriteWithServiceDto {
  @ApiProperty({
    description: 'The ID of the favorite entry',
    example: 'f1e2d3c4-b5a6-7890-abcd-ef1234567890',
  })
  id: string;

  @ApiProperty({
    description: 'The favorited service details',
  })
  service: any;

  @ApiProperty({
    description: 'The date when the service was added to favorites',
    example: '2024-01-15T10:30:00Z',
  })
  createdAt: Date;
}