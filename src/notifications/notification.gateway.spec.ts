import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '../user/services/user.service';
import { NotificationGateway } from './notification.gateway';
import { Socket } from 'socket.io';

describe('NotificationGateway', () => {
  let gateway: NotificationGateway;
  let jwtService: JwtService;
  let userService: UserService;

  const mockJwtService = {
    verify: jest.fn(),
  };

  const mockUserService = {
    findById: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationGateway,
        { provide: JwtService, useValue: mockJwtService },
        { provide: UserService, useValue: mockUserService },
      ],
    }).compile();

    gateway = module.get<NotificationGateway>(NotificationGateway);
    jwtService = module.get<JwtService>(JwtService);
    userService = module.get<UserService>(UserService);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('handleConnection', () => {
    let mockSocket: Partial<Socket> & { disconnect: jest.Mock; join: jest.Mock };

    beforeEach(() => {
      mockSocket = {
        id: 'client-1',
        handshake: {
          auth: {},
          headers: {},
          query: {},
          time: '',
          address: '',
          xdomain: false,
          secure: false,
          issued: 0,
          url: '',
        },
        disconnect: jest.fn(),
        join: jest.fn().mockResolvedValue(undefined),
      };
    });

    it('should disconnect client if no token is found', async () => {
      await gateway.handleConnection(mockSocket as any);
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('should disconnect client if token verification fails', async () => {
      mockSocket.handshake.auth = { token: 'Bearer invalid-token' };
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await gateway.handleConnection(mockSocket as any);
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('should disconnect client if user does not exist', async () => {
      mockSocket.handshake.auth = { token: 'Bearer valid-token' };
      mockJwtService.verify.mockReturnValue({ sub: 'user-1' });
      mockUserService.findById.mockResolvedValue(null);

      await gateway.handleConnection(mockSocket as any);
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('should join user room if authentication succeeds', async () => {
      mockSocket.handshake.auth = { token: 'Bearer valid-token' };
      mockJwtService.verify.mockReturnValue({ sub: 'user-1' });
      mockUserService.findById.mockResolvedValue({ id: 'user-1' });

      await gateway.handleConnection(mockSocket as any);
      expect(mockSocket.join).toHaveBeenCalledWith('user:user-1');
      expect(mockSocket.disconnect).not.toHaveBeenCalled();
    });
  });
});
