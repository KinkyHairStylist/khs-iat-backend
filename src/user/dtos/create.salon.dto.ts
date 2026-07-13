import {
  IsString,
  IsNumber,
  IsArray,
  IsBoolean,
  IsOptional,
} from 'class-validator';

export class CreateSalonDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description: string;

  @IsString()
  address: string;

  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;

  @IsNumber()
  rating: number;

  @IsNumber()
  reviewCount: number;

  @IsArray()
  services: string[];

  @IsBoolean()
  isActive: boolean;
}