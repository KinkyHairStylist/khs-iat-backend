import { ChatGateway } from './chat.gateway';

// The Team Inbox is shared across every staff member, but sendMessageToReceiver
// used to only ever push to the one exact receiver socket. A customer/merchant
// message (senderIsStaff = false) must also reach every other currently-online
// staff member so the whole team's inbox updates live; a staff reply
// (senderIsStaff = true) must still only ever reach that one customer.

function setup(onlineUsers: Record<string, string>, staffIds: string[]) {
  const chatService: any = { getAllStaffIds: jest.fn().mockResolvedValue(staffIds) };
  const gateway = new ChatGateway(chatService);
  const emitted: Array<{ socketId: string; event: string; payload: any }> = [];
  const server = {
    to: (socketId: string) => ({
      emit: (event: string, payload: any) => emitted.push({ socketId, event, payload }),
    }),
  };
  (gateway as any).server = server;
  (gateway as any).onlineUsers = new Map(Object.entries(onlineUsers));
  return { gateway, chatService, emitted };
}

describe('ChatGateway.sendMessageToReceiver', () => {
  it('broadcasts a customer message to the addressed staff member and every other online staff member', async () => {
    const { gateway, emitted } = setup(
      { 'admin-a': 'socket-a', 'admin-b': 'socket-b', 'admin-c': 'socket-c', 'customer-1': 'socket-cust' },
      ['admin-a', 'admin-b', 'admin-c'],
    );
    const message = { receiver: { id: 'admin-a' } };

    await gateway.sendMessageToReceiver(message, false);

    const recipients = emitted.map((e) => e.socketId).sort();
    expect(recipients).toEqual(['socket-a', 'socket-b', 'socket-c'].sort());
    expect(emitted.every((e) => e.event === 'receive_message' && e.payload === message)).toBe(true);
  });

  it('does not double-send to the directly addressed staff member', async () => {
    const { gateway, emitted } = setup(
      { 'admin-a': 'socket-a', 'admin-b': 'socket-b' },
      ['admin-a', 'admin-b'],
    );

    await gateway.sendMessageToReceiver({ receiver: { id: 'admin-a' } }, false);

    expect(emitted.filter((e) => e.socketId === 'socket-a')).toHaveLength(1);
  });

  it('skips an online staff member with no live socket without throwing', async () => {
    const { gateway, emitted } = setup(
      { 'admin-a': 'socket-a' },
      ['admin-a', 'admin-b'], // admin-b is a known staff id but not in onlineUsers
    );

    await gateway.sendMessageToReceiver({ receiver: { id: 'admin-a' } }, false);

    expect(emitted).toHaveLength(1);
    expect(emitted[0].socketId).toBe('socket-a');
  });

  it('only reaches the one customer when staff sends the message, never broadcasting to other staff', async () => {
    const { gateway, chatService, emitted } = setup(
      { 'customer-1': 'socket-cust', 'admin-a': 'socket-a', 'admin-b': 'socket-b' },
      ['admin-a', 'admin-b'],
    );

    await gateway.sendMessageToReceiver({ receiver: { id: 'customer-1' } }, true);

    expect(emitted).toEqual([
      { socketId: 'socket-cust', event: 'receive_message', payload: { receiver: { id: 'customer-1' } } },
    ]);
    expect(chatService.getAllStaffIds).not.toHaveBeenCalled();
  });

  it('is a no-op when neither the receiver nor any staff member is online', async () => {
    const { gateway, emitted } = setup({}, ['admin-a']);

    await gateway.sendMessageToReceiver({ receiver: { id: 'admin-a' } }, false);

    expect(emitted).toHaveLength(0);
  });
});
