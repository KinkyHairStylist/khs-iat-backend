import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

import { ChatMessage } from 'src/all_user_entities/chat-message.entity';
import { UserStatus } from 'src/all_user_entities/user-status.entity';
import { User } from 'src/all_user_entities/user.entity';
import { ChatMessageResponseDto, ChatUserInfoDto } from './send-message.dto';
import { Appointment } from 'src/business/entities/appointment.entity';
import { Business } from 'src/business/entities/business.entity';

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
  ) {}

  // Store a new message
  async storeMessage(data: {
    sender: User;
    receiver: User;
    message?: string;
    imageUrl?: string;
  }): Promise<ChatMessage> {
    const msg = this.chatRepo.create(data);
    return this.chatRepo.save(msg);
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

    const userIds = [authUserId, otherUserId];

    // Booking counts for both users
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

    // Business ratings for both users
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

    // Map messages to DTO
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
}