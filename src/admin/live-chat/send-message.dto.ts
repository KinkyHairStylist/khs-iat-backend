import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsOptional, IsString } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({
    description: 'UUID of the receiver',
    example: '7f52b2a1-3a2c-4e9c-9fd8-6c79d8237b12',
  })
  @IsUUID()
  receiverId: string;

  @ApiProperty({
    description: 'Message text',
    required: false,
    example: 'Hello!',
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

export class ChatMessageResponseDto {
  id: string;
  message?: string;
  imageUrl?: string;
  read: boolean;
  createdAt: string;
  sender: ChatUserInfoDto;
  receiver: ChatUserInfoDto;
}
