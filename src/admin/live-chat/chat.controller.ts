import { Controller, Post, Patch, Body, Get, Query, UseGuards, Param, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { Roles } from 'src/middleware/roles.decorator';
import { Role } from 'src/middleware/role.enum';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { CloudinaryService } from 'src/helpers/cloudinary-massage-image-helper';
import { User } from 'src/all_user_entities/user.entity';
import { RolesGuard } from 'src/middleware/roles.guard';
import { Ticket, TicketStatus } from 'src/all_user_entities/ticket.entity';
import { ChatMessageResponseDto, SendMessageDto, StaffContactDto } from './send-message.dto';
import { GetUser } from 'src/middleware/get-user.decorator';

@ApiTags('Admin and Client Chat')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Staff, Role.Customer, Role.Merchant)
@Controller('users/chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
    private readonly cloudinary: CloudinaryService,
  ) {}

  @Post('send')
  async sendMessage(
    @GetUser() user: User,
    @Body() data: SendMessageDto,
  ) {
    // The ticket always belongs to the customer side of the exchange,
    // regardless of who's actually sending this particular message.
    const customerId = user.isStaff ? data.receiverId : user.id;

    // Staff replying always targets a specific ticket (the one they have
    // open in their inbox) — a customer with only one open ticket can
    // omit it and let the service resolve/create it automatically.
    let ticket = data.ticketId
      ? await this.chatService.getTicketById(data.ticketId)
      : await this.chatService.getSingleOpenTicketOrCreate(customerId);

    if (!ticket) {
      throw new BadRequestException('Ticket not found');
    }
    if (ticket.status === TicketStatus.CLOSED) {
      throw new BadRequestException(
        'This ticket is closed. Start a new conversation instead.',
      );
    }

    let imageUrl: string | undefined;

    if (data.imageBase64) {
      imageUrl = await this.cloudinary.uploadBase64(data.imageBase64);
    }

    const saved = await this.chatService.storeMessage({
      ticket: { id: ticket.id } as Ticket,
      sender: user,
      receiver: { id: data.receiverId } as User,
      message: data.message,
      imageUrl,
    });

    // The gateway broadcast and this endpoint's response both need to
    // carry sender/receiver info (id, name, avatar, email — used by the
    // frontend's real-time handlers), but never the raw User entity,
    // which includes the bcrypt password hash.
    const safeMessage = {
      id: saved.id,
      ticket: { id: ticket.id },
      message: saved.message,
      imageUrl: saved.imageUrl,
      read: saved.read,
      createdAt: saved.createdAt,
      sender: {
        id: user.id,
        firstName: user.firstName,
        surname: user.surname,
        email: user.email,
        avatarUrl: user.avatarUrl,
      },
      receiver: { id: data.receiverId },
    };

    await this.chatGateway.sendMessageToReceiver(safeMessage);

    return safeMessage;
  }

  @Get('messages')
  async getMessages(
    @GetUser() user: User,
    @Query('otherUserId') otherUserId: string,
  ) {
    return this.chatService.getMessagesBetween(user.id, otherUserId);
  }

  @Get('list')
  async getChatList(@GetUser() user: User) {
    return this.chatService.getChatList(user.id);
  }

  // Staff a customer can start a new conversation with, even if no
  // messages have been exchanged yet (getChatList only shows existing
  // conversations).
  @Get('admins')
  async getAllStaffContacts(): Promise<StaffContactDto[]> {
    return this.chatService.getAllStaffContacts();
  }

  @Patch('read/:otherUserId')
  async markConversationAsRead(
    @GetUser() user: User,
    @Param('otherUserId') otherUserId: string,
  ) {
    await this.chatService.markConversationAsRead(user.id, otherUserId);
    return { success: true };
  }

  // GET /chat/messages/:otherUserId
  @Get('messages/:otherUserId')
  async getMessagesBetweenUsers(
    @GetUser() user: User,           // Authenticated user
    @Param('otherUserId') otherUserId: string  // Second user passed via URL
  ): Promise<ChatMessageResponseDto[]> {
    return this.chatService.getChatMessageWithUserInfo(user.id, otherUserId);
  }

  // ─── Tickets ────────────────────────────────────────────────────────────

  // All of this customer's currently-open tickets — up to the 2-ticket cap.
  // The widget shows these to resume; "start a new conversation" is only
  // offered/allowed when this list has room under the cap.
  @Get('tickets/mine')
  async getMyOpenTickets(@GetUser() user: User) {
    return this.chatService.getMyOpenTickets(user.id);
  }

  // Explicit creation, separate from sendMessage's auto-resolve — this is
  // what "start a new conversation" calls, and it's where the open-ticket
  // cap is actually enforced (also re-checked defensively in sendMessage's
  // auto-resolve path for the 0/1-ticket case). assignedAdminId is the
  // staff member the customer picked from "Talk to our team".
  @Post('tickets')
  async createTicket(
    @GetUser() user: User,
    @Body('assignedAdminId') assignedAdminId?: string,
  ) {
    return this.chatService.createTicket(user.id, assignedAdminId);
  }

  // Every ticket this customer has ever opened, not just the current one —
  // backs a "past conversations" view on the customer widget.
  @Get('tickets/mine/history')
  async getMyTicketHistory(@GetUser() user: User) {
    return this.chatService.listMyTickets(user.id);
  }

  @Get('tickets')
  async listTickets(@Query('status') status: TicketStatus = TicketStatus.OPEN) {
    return this.chatService.listTickets(status);
  }

  @Get('tickets/search')
  async searchTicketByNumber(@Query('number') number: string) {
    const ticket = await this.chatService.getTicketByNumber(number);
    if (!ticket) {
      throw new BadRequestException(`No ticket found with number ${number}`);
    }
    return ticket;
  }

  // Ticket-scoped message history — the real boundary a closed ticket
  // needs, so reopening a conversation never blends old and new tickets.
  @Get('tickets/:id/messages')
  async getMessagesByTicket(@Param('id') id: string): Promise<ChatMessageResponseDto[]> {
    return this.chatService.getMessagesByTicket(id);
  }

  // Any staff member viewing a ticket can close it — no assignment/
  // ownership restriction.
  @Patch('tickets/:id/close')
  async closeTicket(
    @GetUser() user: User,
    @Param('id') id: string,
  ) {
    const ticket = await this.chatService.closeTicket(id, user.id);
    this.chatGateway.notifyTicketClosed(ticket);
    return ticket;
  }
}
