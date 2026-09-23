import { ChatGateway } from './chat.gateway';

// join/leave used to trust whatever userId a client claimed, with nothing
// checking it against who the socket actually authenticated as -- any
// logged-in account could emit join('someone-elses-id') and start
// receiving that other account's live chat messages. The socket's own
// auth token (handshake auth.token, matching how the real frontend and
// NotificationGateway both already use it) is the only identity a claimed
// userId is now allowed to match.

function setup(decodedSub: string | null | 'throw') {
  const chatService: any = { setUserOnline: jest.fn().mockResolvedValue(undefined) };
  const jwtService: any = {
    verify: jest.fn(() => {
      if (decodedSub === 'throw') throw new Error('invalid token');
      return decodedSub === null ? undefined : { sub: decodedSub };
    }),
  };
  const gateway = new ChatGateway(chatService, jwtService);
  const emitted: Array<{ event: string; payload: any }> = [];
  (gateway as any).server = { emit: (event: string, payload: any) => emitted.push({ event, payload }) };
  const onlineUsers: Map<string, string> = (gateway as any).onlineUsers;
  return { gateway, chatService, emitted, onlineUsers };
}

function socketWithToken(token: string | undefined, id = 'socket-1') {
  return { id, handshake: { auth: { token }, headers: {}, query: {} } } as any;
}

describe('ChatGateway.handleJoin', () => {
  it('refuses to register a userId that does not match the authenticated token', async () => {
    const { gateway, chatService, emitted, onlineUsers } = setup('real-user');
    await gateway.handleJoin(socketWithToken('some-token'), 'someone-elses-id');

    expect(onlineUsers.has('someone-elses-id')).toBe(false);
    expect(chatService.setUserOnline).not.toHaveBeenCalled();
    expect(emitted).toHaveLength(0);
  });

  it('refuses a socket with no token at all', async () => {
    const { gateway, onlineUsers } = setup(null);
    await gateway.handleJoin(socketWithToken(undefined), 'any-id');

    expect(onlineUsers.size).toBe(0);
  });

  it('refuses a socket whose token fails to verify', async () => {
    const { gateway, onlineUsers } = setup('throw');
    await gateway.handleJoin(socketWithToken('garbage'), 'any-id');

    expect(onlineUsers.size).toBe(0);
  });

  it('registers the user when the claimed id matches the authenticated token', async () => {
    const { gateway, chatService, emitted, onlineUsers } = setup('real-user');
    await gateway.handleJoin(socketWithToken('some-token', 'socket-42'), 'real-user');

    expect(onlineUsers.get('real-user')).toBe('socket-42');
    expect(chatService.setUserOnline).toHaveBeenCalledWith('real-user', true);
    expect(emitted).toEqual([{ event: 'user_status', payload: { userId: 'real-user', isOnline: true } }]);
  });
});

describe('ChatGateway.handleLeave', () => {
  it("refuses to remove another user's online entry via a mismatched claimed id", async () => {
    const { gateway, chatService, onlineUsers } = setup('real-user');
    onlineUsers.set('someone-elses-id', 'their-socket');

    await gateway.handleLeave(socketWithToken('some-token'), 'someone-elses-id');

    expect(onlineUsers.has('someone-elses-id')).toBe(true);
    expect(chatService.setUserOnline).not.toHaveBeenCalled();
  });

  it('removes the user when the claimed id matches the authenticated token', async () => {
    const { gateway, chatService, onlineUsers } = setup('real-user');
    onlineUsers.set('real-user', 'socket-42');

    await gateway.handleLeave(socketWithToken('some-token'), 'real-user');

    expect(onlineUsers.has('real-user')).toBe(false);
    expect(chatService.setUserOnline).toHaveBeenCalledWith('real-user', false);
  });
});
