import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsOptional, IsString } from 'class-validator';

export class SendAdminMessageDto {
  @ApiProperty({
    description: 'UUID of the admin receiver',
    example: '7f52b2a1-3a2c-4e9c-9fd8-6c79d8237b12',
  })
  @IsUUID()
  adminId: string;

  @ApiProperty({
    description: 'Message text',
    required: false,
    example: 'Hello Admin!',
  })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiProperty({
    description: 'Base64 encoded image string',
    required: false,
  })
  @IsOptional()
  @IsString()
  imageBase64?: string;
}

export class ChatUserInfoDto {
  name: string;
  avatarUrl?: string;
  initials: string;
  email: string;
  phone: string;
  location: string;
  joinDate: string;
  totalCountBookings: number;
  rating: number;
}

export class AdminChatMessageResponseDto {
  id: string;
  message?: string;
  imageUrl?: string;
  read: boolean;
  createdAt: string;
  sender: ChatUserInfoDto;
  receiver: ChatUserInfoDto;
}

export class AdminDto {
  id: string;
  name: string;
  avatarUrl?: string;
  initials: string;
  email: string;
  phone?: string;
  isOnline: boolean;
  lastSeen?: string;
}
