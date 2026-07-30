import { Injectable, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { ILike, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

import { ChatMessage } from 'src/all_user_entities/chat-message.entity';
import { UserStatus } from 'src/all_user_entities/user-status.entity';
import { User } from 'src/all_user_entities/user.entity';
import { Ticket, TicketStatus } from 'src/all_user_entities/ticket.entity';
import { ChatMessageResponseDto, ChatUserInfoDto, StaffContactDto, TicketResponseDto } from './send-message.dto';
import { Appointment } from 'src/business/entities/appointment.entity';
import { Business } from 'src/business/entities/business.entity';
import { ChatGateway } from './chat.gateway';
import { SlackService } from 'src/slack/slack.service';

const TICKET_NUMBER_SEQUENCE = 'ticket_number_seq';

export interface ChatListItem {
  userId: string;
  name: string;
  avatarUrl?: string;
  lastMessage: string;
  imageUrl?: string;
  isOnline: boolean;
  timestamp: Date;
  unreadCount: number,
  isRead: boolean
}

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatMessage)
    private chatRepo: Repository<ChatMessage>,

    @InjectRepository(Appointment)
    private appointmentRepo: Repository<Appointment>,

    @InjectRepository(Business)
    private businessRepo: Repository<Business>,

    @InjectRepository(UserStatus)
    private statusRepo: Repository<UserStatus>,

    @InjectRepository(User)
    private userRepo: Repository<User>,

    @InjectRepository(Ticket)
    private ticketRepo: Repository<Ticket>,

    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,

    private readonly slackService: SlackService,
  ) {}

  // Store a new message
  async storeMessage(data: {
    ticket?: Ticket;
    sender: User;
    receiver: User;
    message?: string;
    imageUrl?: string;
  }): Promise<ChatMessage> {
    const msg = this.chatRepo.create(data);
    return this.chatRepo.save(msg);
  }

  // ─── Tickets ────────────────────────────────────────────────────────────

  // Sequential, human-searchable ticket numbers (TCK-1001, TCK-1002, ...).
  // Uses a real Postgres sequence so concurrent ticket creation can never
  // collide — created once, idempotently, the first time it's needed.
  private async nextTicketNumber(): Promise<string> {
    await this.ticketRepo.query(
      `CREATE SEQUENCE IF NOT EXISTS ${TICKET_NUMBER_SEQUENCE} START 1001`,
    );
    const [{ nextval }] = await this.ticketRepo.query(
      `SELECT nextval('${TICKET_NUMBER_SEQUENCE}') AS nextval`,
    );
    return `TCK-${nextval}`;
  }

  // Never return the raw Ticket entity from a controller — its customer/
  // assignedAdmin/closedBy relations are full User rows (password hash
  // included). This is the only shape that should leave the service.
  // withCustomerSummary is only needed by admin-facing listing/search, not
  // the customer widget's own findOrCreateOpenTicket/closeTicket calls.
  private async toResponseDto(
    ticket: Ticket,
    withCustomerSummary = false,
  ): Promise<TicketResponseDto> {
    const dto: TicketResponseDto = {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      status: ticket.status,
      customerId: ticket.customer.id,
      assignedAdminId: ticket.assignedAdmin?.id ?? null,
      closedById: ticket.closedBy?.id ?? null,
      closedAt: ticket.closedAt ? ticket.closedAt.toISOString() : null,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
    };

    if (withCustomerSummary) {
      const isOnline = await this.getUserStatus(ticket.customer.id);
      const name =
        `${ticket.customer.firstName ?? ''} ${ticket.customer.surname ?? ''}`.trim() ||
        'Unknown';
      dto.customer = {
        name,
        avatarUrl: ticket.customer.avatarUrl ?? null,
        isOnline,
        isMerchant: !!ticket.customer.isMerchant,
      };

      const lastMessage = await this.chatRepo.findOne({
        where: { ticket: { id: ticket.id } },
        order: { createdAt: 'DESC' },
      });
      dto.lastMessage = lastMessage
        ? lastMessage.message || (lastMessage.imageUrl ? '[Image]' : '')
        : null;
    }

    return dto;
  }

  static readonly MAX_OPEN_TICKETS_PER_CUSTOMER = 2;

  // All of this customer's currently-open tickets (0, 1, or up to the cap).
  async getMyOpenTickets(customerId: string): Promise<TicketResponseDto[]> {
    const tickets = await this.ticketRepo.find({
      where: { customer: { id: customerId }, status: TicketStatus.OPEN },
      relations: ['customer', 'assignedAdmin', 'closedBy'],
      order: { createdAt: 'DESC' },
    });
    return Promise.all(tickets.map((t) => this.toResponseDto(t)));
  }

  // Creates a new ticket for this customer — but only if they're under the
  // open-ticket cap. Enforced here, not just in the UI, since sendMessage
  // also goes through this path. assignedAdminId records who the customer
  // picked from "Talk to our team" — the frontend needs this to restore
  // who a resumed ticket's conversation is with.
  async createTicket(
    customerId: string,
    assignedAdminId?: string,
  ): Promise<TicketResponseDto> {
    const openCount = await this.ticketRepo.count({
      where: { customer: { id: customerId }, status: TicketStatus.OPEN },
    });

    if (openCount >= ChatService.MAX_OPEN_TICKETS_PER_CUSTOMER) {
      throw new BadRequestException(
        `You already have ${ChatService.MAX_OPEN_TICKETS_PER_CUSTOMER} open conversations. Close one before starting another.`,
      );
    }

    const ticketNumber = await this.nextTicketNumber();
    const ticket = this.ticketRepo.create({
      ticketNumber,
      customer: { id: customerId } as User,
      assignedAdmin: assignedAdminId ? ({ id: assignedAdminId } as User) : undefined,
      status: TicketStatus.OPEN,
    });

    const saved = await this.ticketRepo.save(ticket);

    // toResponseDto's withCustomerSummary path reads ticket.customer.firstName
    // etc. — the bare { id } stub above doesn't have those loaded, so
    // re-fetch with relations to get the real customer/assignedAdmin rows.
    const withRelations = await this.ticketRepo.findOne({
      where: { id: saved.id },
      relations: ['customer', 'assignedAdmin', 'closedBy'],
    });
    const dto = await this.toResponseDto(withRelations!, true);

    // Team Inbox needs to know about brand-new tickets live — receive_message
    // alone can't add a new row to an admin's list (see chat.gateway.ts).
    this.chatGateway.notifyTicketCreated(dto);

    const assignedAdminName = withRelations!.assignedAdmin
      ? `${withRelations!.assignedAdmin.firstName ?? ''} ${withRelations!.assignedAdmin.surname ?? ''}`.trim() || 'Unknown'
      : null;
    this.slackService.notify(this.formatTicketCreatedSlackMessage(dto, assignedAdminName));

    return dto;
  }

  // Matches c2c's standard Slack notification template (header + LOC/
  // TRIGGER/DETAILS/TIMESTAMP), simplified — KHS doesn't need the
  // node/provider/severity taxonomy from that codebase, just a clear
  // ticket-opened alert.
  private nowInWAT(): string {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      timeZone: 'Africa/Lagos',
    }).format(new Date());
  }

  private formatTicketCreatedSlackMessage(
    ticket: TicketResponseDto,
    assignedAdminName: string | null,
  ): string {
    const customerName = ticket.customer?.name ?? 'Unknown';
    const assignedLine = assignedAdminName
      ? `• Assigned to: ${assignedAdminName}`
      : '• Assigned to: _unassigned_';

    return `[KHS] [SUPPORT] [INFO] [TICKET_CREATED]
*TRIGGER:* \`${customerName}\`
*DETAILS:*
New support ticket opened: *${ticket.ticketNumber}*
• Customer: ${customerName}
${assignedLine}
*TIMESTAMP:* \`${this.nowInWAT()} (WAT)\``;
  }

  private formatTicketClosedSlackMessage(
    ticket: TicketResponseDto,
    closedByName: string,
  ): string {
    const customerName = ticket.customer?.name ?? 'Unknown';

    return `[KHS] [SUPPORT] [INFO] [TICKET_CLOSED]
*TRIGGER:* \`${closedByName}\`
*DETAILS:*
Ticket closed: *${ticket.ticketNumber}*
• Customer: ${customerName}
• Closed by: ${closedByName}
*TIMESTAMP:* \`${this.nowInWAT()} (WAT)\``;
  }

  // Used by sendMessage — resolves to a ticket without ever silently
  // creating a second one when the caller didn't ask for that. If the
  // customer has exactly one open ticket, use it. If they have none,
  // create one (respecting the cap, though 0 -> 1 never hits it). If they
  // have more than one open, the caller MUST specify which ticket via
  // ticketId — sendMessage enforces this before calling here.
  async getSingleOpenTicketOrCreate(customerId: string): Promise<TicketResponseDto> {
    const open = await this.getMyOpenTickets(customerId);
    if (open.length === 1) return open[0];
    if (open.length === 0) return this.createTicket(customerId);
    throw new BadRequestException(
      'You have multiple open conversations — specify which ticket this message belongs to.',
    );
  }

  async getTicketById(ticketId: string): Promise<TicketResponseDto | null> {
    const ticket = await this.ticketRepo.findOne({
      where: { id: ticketId },
      relations: ['customer', 'assignedAdmin', 'closedBy'],
    });
    return ticket ? this.toResponseDto(ticket) : null;
  }

  async closeTicket(ticketId: string, closedByAdminId: string): Promise<TicketResponseDto> {
    const ticket = await this.ticketRepo.findOne({
      where: { id: ticketId },
      relations: ['customer', 'assignedAdmin', 'closedBy'],
    });
    if (!ticket) {
      throw new BadRequestException('Ticket not found');
    }

    ticket.status = TicketStatus.CLOSED;
    ticket.closedAt = new Date();
    ticket.closedBy = { id: closedByAdminId } as User;

    const saved = await this.ticketRepo.save(ticket);

    // Same reason as createTicket — the bare { id } stub above has no
    // firstName/surname loaded, so re-fetch to get the real closedBy name
    // for the Slack notification.
    const withRelations = await this.ticketRepo.findOne({
      where: { id: saved.id },
      relations: ['customer', 'assignedAdmin', 'closedBy'],
    });
    const dto = await this.toResponseDto(withRelations!, true);

    const closedByName = withRelations!.closedBy
      ? `${withRelations!.closedBy.firstName ?? ''} ${withRelations!.closedBy.surname ?? ''}`.trim() || 'Unknown'
      : 'Unknown';
    this.slackService.notify(this.formatTicketClosedSlackMessage(dto, closedByName));

    return dto;
  }

  // Case-insensitive — an admin searching by number may have gotten it
  // from a screenshot, an email, or dictated over the phone, and shouldn't
  // hit a false "not found" over casing alone.
  async getTicketByNumber(ticketNumber: string): Promise<TicketResponseDto | null> {
    const ticket = await this.ticketRepo.findOne({
      where: { ticketNumber: ILike(ticketNumber.trim()) },
      relations: ['customer', 'assignedAdmin', 'closedBy'],
    });
    return ticket ? this.toResponseDto(ticket, true) : null;
  }

  async listTickets(status: TicketStatus): Promise<TicketResponseDto[]> {
    const tickets = await this.ticketRepo.find({
      where: { status },
      relations: ['customer', 'assignedAdmin', 'closedBy'],
      order: { createdAt: 'DESC' },
    });
    return Promise.all(tickets.map((t) => this.toResponseDto(t, true)));
  }

  // The customer's own ticket history — every ticket they've ever opened,
  // not just the currently-open one findOrCreateOpenTicket resumes.
  async listMyTickets(customerId: string): Promise<TicketResponseDto[]> {
    const tickets = await this.ticketRepo.find({
      where: { customer: { id: customerId } },
      relations: ['customer', 'assignedAdmin', 'closedBy'],
      order: { createdAt: 'DESC' },
    });
    return Promise.all(tickets.map((t) => this.toResponseDto(t)));
  }

  // Get user online/offline status
  async getUserStatus(userId: string): Promise<boolean> {
    const status = await this.statusRepo.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });

    return status?.isOnline ?? false;
  }

  // Set user online/offline
  async setUserOnline(userId: string, isOnline: boolean) {
    let status = await this.statusRepo.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });

    if (!status) {
      status = this.statusRepo.create({
        user: { id: userId } as User,
        isOnline,
      });
    } else {
      status.isOnline = isOnline;
    }

    await this.statusRepo.save(status);
  }

  // Mark message as read
  async markAsRead(messageId: string) {
    const msg = await this.chatRepo.findOne({ where: { id: messageId } });
    if (msg && !msg.read) {
      msg.read = true;
      await this.chatRepo.save(msg);
    }
    return msg;
  }

  // Mark every message the other party sent to this user as read (called
  // when the user opens/reselects that conversation).
  async markConversationAsRead(userId: string, otherUserId: string) {
    const unread = await this.chatRepo.find({
      where: {
        sender: { id: otherUserId },
        receiver: { id: userId },
        read: false,
      },
    });

    if (unread.length === 0) return;

    await this.chatRepo.update(
      unread.map((msg) => msg.id),
      { read: true },
    );
  }

  // Get all messages between two users
  async getMessagesBetween(userId1: string, userId2: string): Promise<ChatMessage[]> {
    return this.chatRepo.find({
      where: [
        { sender: { id: userId1 }, receiver: { id: userId2 } },
        { sender: { id: userId2 }, receiver: { id: userId1 } },
      ],
      order: { createdAt: 'ASC' },
    });
  }

  // Staff a customer can start a new conversation with — separate from
  // getChatList, which only shows conversations that already have messages.
  async getAllStaffContacts(): Promise<StaffContactDto[]> {
    const staff = await this.userRepo.find({ where: { isStaff: true } });

    const contacts: StaffContactDto[] = [];
    for (const member of staff) {
      const isOnline = await this.getUserStatus(member.id);
      const name = `${member.firstName ?? ''} ${member.surname ?? ''}`.trim() || 'Admin';
      const initials = name
        .split(' ')
        .map((n) => n.charAt(0).toUpperCase())
        .join('')
        .toUpperCase();

      contacts.push({
        id: member.id,
        name,
        avatarUrl: member.avatarUrl,
        initials,
        email: member.email,
        phone: member.phoneNumber,
        isOnline,
        lastSeen: member.createdAt.toISOString(),
      });
    }

    return contacts;
  }

  // Get chat list for the signed-in user
  async getChatList(userId: string): Promise<ChatListItem[]> {
    const messages = await this.chatRepo
      .createQueryBuilder('msg')
      .leftJoinAndSelect('msg.receiver', 'receiver')
      .leftJoinAndSelect('msg.sender', 'sender')
      .where('sender.id = :userId OR receiver.id = :userId', { userId })
      .orderBy('msg.createdAt', 'DESC')
      .getMany();

    const convMap = new Map<string, ChatMessage>();

    messages.forEach(msg => {
      const otherUserId =
        msg.sender.id === userId ? msg.receiver.id : msg.sender.id;

      if (!convMap.has(otherUserId)) {
        convMap.set(otherUserId, msg);
      }
    });

    const chatList: ChatListItem[] = [];

    for (const [otherUserId, msg] of convMap.entries()) {
      const isOnline = await this.getUserStatus(otherUserId);
      const otherUser =
        msg.sender.id === userId ? msg.receiver : msg.sender;

      const name =
        `${otherUser.firstName ?? ''} ${otherUser.surname ?? ''}`.trim() ||
        'Unknown';

      const isRead = msg.read;

      const unreadCount = await this.chatRepo.count({
        where: {
          sender: { id: otherUser.id },
          receiver: { id: userId },
          read: false,
        },
      });

      chatList.push({
        userId: otherUser.id,
        name,
        avatarUrl: otherUser.avatarUrl ?? '',
        lastMessage: msg.message || '[Image]',
        imageUrl: msg.imageUrl,
        isOnline,
        timestamp: msg.createdAt,
        isRead,
        unreadCount
      });
    }

    return chatList.sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
    );
  }

  private mapUserToChatProfile(
    user: User,
    bookingCount: number,
    rating: number
  ): ChatUserInfoDto {
    const name = `${user.firstName ?? ''} ${user.surname ?? ''}`.trim() || 'Unknown';
    const initials = name
      .split(' ')
      .map((n) => n.charAt(0).toUpperCase())
      .join('')
      .toLocaleUpperCase();

    return {
      userId: user.id,
      name,
      initials,
      email: user.email,
      avatarUrl: user.avatarUrl,
      phone: user.phoneNumber,
      location: user.addresses?.[0]?.fullAddress || 'Not provided' ,
      joinDate: user.createdAt.toISOString(),
      totalCountBookings: bookingCount,
      rating,
    };
  }

  // Shared by both getChatMessageWithUserInfo and getMessagesByTicket —
  // enriches a set of already-fetched messages with booking counts and
  // business ratings for whichever users appear in them.
  private async toMessageResponseDtos(
    messages: ChatMessage[],
  ): Promise<ChatMessageResponseDto[]> {
    const userIds = Array.from(
      new Set(messages.flatMap((m) => [m.sender.id, m.receiver.id])),
    );

    if (userIds.length === 0) return [];

    const bookingCounts = await this.appointmentRepo
      .createQueryBuilder('a')
      .select('a.client_id', 'clientId')
      .addSelect('COUNT(a.id)', 'count')
      .where('a.client_id IN (:...userIds)', { userIds })
      .groupBy('a.client_id')
      .getRawMany();

    const bookingMap = bookingCounts.reduce((acc, row) => {
      acc[row.clientId] = Number(row.count);
      return acc;
    }, {});

    const businessRatings = await this.businessRepo
      .createQueryBuilder('b')
      .select('b.owner_id', 'ownerId')
      .addSelect("AVG((b.performance->>'rating')::float)", 'rating')
      .where('b.owner_id IN (:...userIds)', { userIds })
      .groupBy('b.owner_id')
      .getRawMany();

    const ratingMap = businessRatings.reduce((acc, row) => {
      acc[row.ownerId] = parseFloat(row.rating ?? 0);
      return acc;
    }, {});

    return messages.map((msg) => ({
      id: msg.id,
      messages: msg.message,
      imageUrl: msg.imageUrl,
      read: msg.read,
      createdAt: msg.createdAt.toISOString(),
      sender: this.mapUserToChatProfile(
        msg.sender,
        bookingMap[msg.sender.id] || 0,
        ratingMap[msg.sender.id] || 0
      ),
      receiver: this.mapUserToChatProfile(
        msg.receiver,
        bookingMap[msg.receiver.id] || 0,
        ratingMap[msg.receiver.id] || 0
      ),
    }));
  }

  async getChatMessageWithUserInfo(
    authUserId: string,
    otherUserId: string
  ): Promise<ChatMessageResponseDto[]> {
    // Fetch messages only between the two users
    const messages = await this.chatRepo
      .createQueryBuilder('msg')
      .leftJoinAndSelect('msg.sender', 'sender')
      .leftJoinAndSelect('msg.receiver', 'receiver')
      .where(
        '(sender.id = :authUserId AND receiver.id = :otherUserId) OR (sender.id = :otherUserId AND receiver.id = :authUserId)',
        { authUserId, otherUserId }
      )
      .orderBy('msg.createdAt', 'ASC')
      .getMany();

    return this.toMessageResponseDtos(messages);
  }

  // Ticket-scoped — the real boundary a closed ticket needs. Messages sent
  // before ticketing existed have no ticketId and never show up here.
  async getMessagesByTicket(ticketId: string): Promise<ChatMessageResponseDto[]> {
    const messages = await this.chatRepo
      .createQueryBuilder('msg')
      .leftJoinAndSelect('msg.sender', 'sender')
      .leftJoinAndSelect('msg.receiver', 'receiver')
      .where('msg.ticketId = :ticketId', { ticketId })
      .orderBy('msg.createdAt', 'ASC')
      .getMany();

    return this.toMessageResponseDtos(messages);
  }
}