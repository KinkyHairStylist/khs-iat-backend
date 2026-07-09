import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

import { ChatMessage } from 'src/all_user_entities/chat-message.entity';
import { UserStatus } from 'src/all_user_entities/user-status.entity';
import { User } from 'src/all_user_entities/user.entity';
import { AdminChatMessageResponseDto, ChatUserInfoDto, AdminDto } from '../dtos/send-admin-message.dto';
import { Appointment } from 'src/business/entities/appointment.entity';
import { Business } from 'src/business/entities/business.entity';

@Injectable()
export class AdminChatService {
  constructor(
    @InjectRepository(ChatMessage)
    private chatRepo: Repository< ChatMessage>,

    @InjectRepository(UserStatus)
    private statusRepo: Repository<UserStatus>,

    @InjectRepository(User)
    private userRepo: Repository<User>,

    @InjectRepository(Appointment)
    private appointmentRepo: Repository<Appointment>,

    @InjectRepository(Business)
    private businessRepo: Repository<Business>,
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

  // Get all messages between user and admin
  async getMessagesWithAdmin(userId: string, adminId: string): Promise<ChatMessage[]> {
    return this.chatRepo.find({
      where: [
        { sender: { id: userId }, receiver: { id: adminId } },
        { sender: { id: adminId }, receiver: { id: userId } },
      ],
      order: { createdAt: 'ASC' },
    });
  }

  // Get all admins
  async getAllAdmins(): Promise<AdminDto[]> {
    // Use role fields directly from user entity (merged from UserRole)
    const users = await this.userRepo.find({
      where: [
        { isAdmin: true } as any,
        { isSuperAdmin: true } as any,
      ],
    });

    const adminDtos: AdminDto[] = [];

    for (const admin of users) {
      const isOnline = await this.getUserStatus(admin.id);
      const name = `${admin.firstName ?? ''} ${admin.surname ?? ''}`.trim() || 'Admin';
      const initials = name
        .split(' ')
        .map((n) => n.charAt(0).toUpperCase())
        .join('')
        .toUpperCase();

      adminDtos.push({
        id: admin.id,
        name,
        avatarUrl: admin.avatarUrl,
        initials,
        email: admin.email,
        phone: admin.phoneNumber,
        isOnline,
        lastSeen: admin.createdAt.toISOString(),
      });
    }

    return adminDtos;
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

  async getChatMessageWithAdmin(
    userId: string,
    adminId: string
  ): Promise<AdminChatMessageResponseDto[]> {

    // Verify admin exists and is actually an admin - use role fields directly from user
    const adminUser = await this.userRepo
      .createQueryBuilder('user')
      .where('user.id = :adminId AND (user.isAdmin = :isAdmin OR user.isSuperAdmin = :isSuperAdmin)', {
        adminId,
        isAdmin: true,
        isSuperAdmin: true
      })
      .getOne();

    if (!adminUser) {
      throw new Error('User is not an admin');
    }

    // Fetch messages only between the user and admin
    const messages = await this.chatRepo
      .createQueryBuilder('msg')
      .leftJoinAndSelect('msg.sender', 'sender')
      .leftJoinAndSelect('msg.receiver', 'receiver')
      .where(
        '(sender.id = :userId AND receiver.id = :adminId) OR (sender.id = :adminId AND receiver.id = :userId)',
        { userId, adminId }
      )
      .orderBy('msg.createdAt', 'ASC')
      .getMany();

    const userIds = [userId, adminId];

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
