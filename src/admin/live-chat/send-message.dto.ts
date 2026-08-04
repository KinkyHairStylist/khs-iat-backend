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

  @ApiProperty({
    description:
      'Which ticket this message belongs to. Required when the customer has more than one open ticket (up to the 2-ticket cap) — optional otherwise, since there is only one possible ticket to resolve to.',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  ticketId?: string;
}

export class ChatUserInfoDto {
  userId: string;
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

export class StaffContactDto {
  id: string;
  name: string;
  avatarUrl?: string;
  initials: string;
  email: string;
  phone?: string;
  isOnline: boolean;
  lastSeen?: string;
}

export class TicketCustomerSummaryDto {
  name: string;
  avatarUrl?: string | null;
  isOnline: boolean;
  // Merchant tickets are surfaced as higher-priority in the Team Inbox.
  isMerchant: boolean;
}

// Never the raw User entity — that includes the password hash and other
// sensitive fields. This is the only shape the ticket endpoints return.
export class TicketResponseDto {
  id: string;
  ticketNumber: string;
  status: 'open' | 'closed';
  customerId: string;
  assignedAdminId?: string | null;
  closedById?: string | null;
  closedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  // Only populated by admin-facing listing/search methods — the customer
  // widget's own findOrCreateOpenTicket/closeTicket calls don't need it.
  customer?: TicketCustomerSummaryDto;
  lastMessage?: string | null;
}
