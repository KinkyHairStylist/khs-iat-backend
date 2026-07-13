// import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
// import {
//   IsEmail,
//   IsEnum,
//   IsNotEmpty,
//   IsOptional,
//   IsString,
// } from 'class-validator';
// import type { ConversationCategory } from 'src/all_user_entities/support-ticket.entity';

// export class CreateSupportTicketDto {
//   @ApiProperty({
//     example: 'Payment',
//     description: 'Category of the ticket (e.g., Booking, Payment, Technical)',
//     enum: ['Booking', 'Payment', 'Technical'],
//   })
//   @IsEnum(['Booking', 'Payment', 'Technical'])
//   @IsNotEmpty()
//   category: ConversationCategory;

//   @ApiProperty({ example: 'I was charged twice for my booking', description: 'Initial message from the user' })
//   @IsString()
//   @IsNotEmpty()
//   message: string;

//   @ApiPropertyOptional({ example: 'Mary Johnson', description: 'User name (optional if pulled from user entity)' })
//   @IsOptional()
//   @IsString()
//   userName?: string;

//   @ApiPropertyOptional({ example: 'mary@example.com', description: 'User email (optional if pulled from user entity)' })
//   @IsOptional()
//   @IsEmail()
//   userEmail?: string;
// }
