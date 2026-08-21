import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationService } from './notification.service';
import { Notification } from './notification.entity';
import { NotificationGateway } from './notification.gateway';
import { NotificationType } from './notification.enum';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('NotificationService', () => {
  let service: NotificationService;
  let repo: Repository<Notification>;
  let gateway: NotificationGateway;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findAndCount: jest.fn(),
    count: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    remove: jest.fn(),
  };

  const mockGateway = {
    sendToUser: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        {
          provide: getRepositoryToken(Notification),
          useValue: mockRepository,
        },
        {
          provide: NotificationGateway,
          useValue: mockGateway,
        },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
    repo = module.get<Repository<Notification>>(getRepositoryToken(Notification));
    gateway = module.get<NotificationGateway>(NotificationGateway);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create and save a notification, then call gateway.sendToUser', async () => {
      const dto = {
        userId: 'user-1',
        type: NotificationType.BOOKING_CONFIRMED,
        title: 'Booking confirmed',
        message: 'Your booking has been confirmed',
        link: '/bookings/1',
        metadata: { bookingId: '1' },
      };

      const createdObj = { ...dto, id: 'notif-1', isRead: false };
      mockRepository.create.mockReturnValue(createdObj);
      mockRepository.save.mockResolvedValue(createdObj);

      const result = await service.create(dto);

      expect(mockRepository.create).toHaveBeenCalledWith({
        userId: dto.userId,
        type: dto.type,
        title: dto.title,
        message: dto.message,
        link: dto.link,
        metadata: dto.metadata,
        isRead: false,
      });
      expect(mockRepository.save).toHaveBeenCalledWith(createdObj);
      expect(mockGateway.sendToUser).toHaveBeenCalledWith('user-1', 'notification:new', createdObj);
      expect(result).toEqual(createdObj);
    });
  });

  describe('getUserNotifications', () => {
    it('should return paginated notifications and count', async () => {
      const notifications = [{ id: 'notif-1', userId: 'user-1' }];
      mockRepository.findAndCount.mockResolvedValue([notifications, 1]);
      mockRepository.count.mockResolvedValue(1);

      const result = await service.getUserNotifications('user-1', 1, 20);

      expect(mockRepository.findAndCount).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 20,
      });
      expect(result).toEqual({
        notifications,
        total: 1,
        page: 1,
        limit: 20,
        unreadCount: 1,
      });
    });
  });

  describe('markAsRead', () => {
    it('should throw NotFoundException if notification does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.markAsRead('user-1', 'notif-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if notification belongs to another user', async () => {
      mockRepository.findOne.mockResolvedValue({ id: 'notif-1', userId: 'user-2' });

      await expect(service.markAsRead('user-1', 'notif-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should mark notification as read', async () => {
      const notif = { id: 'notif-1', userId: 'user-1', isRead: false, save: jest.fn() };
      mockRepository.findOne.mockResolvedValue(notif);
      mockRepository.save.mockImplementation((n) => Promise.resolve(n));

      const result = await service.markAsRead('user-1', 'notif-1');

      expect(result.isRead).toBe(true);
      expect(result.readAt).toBeDefined();
      expect(mockRepository.save).toHaveBeenCalledWith(notif);
    });
  });

  describe('markAllAsRead', () => {
    it('should call update with isRead true', async () => {
      await service.markAllAsRead('user-1');
      expect(mockRepository.update).toHaveBeenCalledWith(
        { userId: 'user-1', isRead: false },
        { isRead: true, readAt: expect.any(Date) },
      );
    });
  });

  describe('delete', () => {
    it('should throw NotFoundException if notification does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.delete('user-1', 'notif-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if notification belongs to another user', async () => {
      mockRepository.findOne.mockResolvedValue({ id: 'notif-1', userId: 'user-2' });

      await expect(service.delete('user-1', 'notif-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should remove the notification if ownership is correct', async () => {
      const notif = { id: 'notif-1', userId: 'user-1' };
      mockRepository.findOne.mockResolvedValue(notif);
      mockRepository.remove.mockResolvedValue(notif);

      await service.delete('user-1', 'notif-1');

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
      });
      expect(mockRepository.remove).toHaveBeenCalledWith(notif);
    });
  });

  describe('deleteAll', () => {
    it('should call delete on repository with userId', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 5 });

      await service.deleteAll('user-1');

      expect(mockRepository.delete).toHaveBeenCalledWith({ userId: 'user-1' });
    });
  });
});
