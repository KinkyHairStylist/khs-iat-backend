import { ChatGateway } from './chat.gateway';

// Staff now work from khs-iat-staff-be. Customer-side events must be
// published to them over the chat bridge, staff events arriving over the
// bridge must reach only the customer they're for, and ticket events must no
// longer be broadcast to every connected socket (they carried the customer's
// name to everyone).

function setup(staffIds: string[] = []) {
  const chatService: any = {
    getAllStaffIds: jest.fn().mockResolvedValue(staffIds),
    setUserOnline: jest.fn().mockResolvedValue(undefined),
  };
  const jwtService: any = { verify: jest.fn() };
  let staffHandler: (event: any) => void = () => undefined;
  const chatBridge: any = {
    publish: jest.fn().mockResolvedValue(undefined),
    onStaffEvent: jest.fn((h) => (staffHandler = h)),
  };
  const gateway = new ChatGateway(chatService, jwtService, chatBridge);
  const toRoom: Array<{ room: string; event: string; payload: any }> = [];
  const broadcast: Array<{ event: string; payload: any }> = [];
  (gateway as any).server = {
    to: (room: string) => ({ emit: (event: string, payload: any) => toRoom.push({ room, event, payload }) }),
    emit: (event: string, payload: any) => broadcast.push({ event, payload }),
  };
  gateway.onModuleInit();
  return { gateway, chatBridge, toRoom, broadcast, deliver: (e: any) => staffHandler(e) };
}

describe('ChatGateway and the chat bridge', () => {
  it('publishes a customer message to staff', async () => {
    const { gateway, chatBridge } = setup();
    const message = { receiver: { id: 'admin-a' } };
    await gateway.sendMessageToReceiver(message, false);
    expect(chatBridge.publish).toHaveBeenCalledWith({ type: 'receive_message', payload: message });
  });

  it('does not publish a staff message back to staff', async () => {
    const { gateway, chatBridge } = setup();
    await gateway.sendMessageToReceiver({ receiver: { id: 'customer-1' } }, true);
    expect(chatBridge.publish).not.toHaveBeenCalled();
  });

  it('delivers a staff reply only to that customer\'s room', () => {
    const { deliver, toRoom, broadcast } = setup();
    deliver({ type: 'receive_message', customerId: 'customer-1', payload: { id: 'm1' } });
    expect(toRoom).toEqual([{ room: 'user:customer-1', event: 'receive_message', payload: { id: 'm1' } }]);
    expect(broadcast).toHaveLength(0);
  });

  it('delivers a ticket closed by staff only to that customer', () => {
    const { deliver, toRoom, broadcast } = setup();
    deliver({ type: 'ticket_closed', customerId: 'customer-1', payload: { id: 't1' } });
    expect(toRoom).toEqual([{ room: 'user:customer-1', event: 'ticket_closed', payload: { id: 't1' } }]);
    expect(broadcast).toHaveLength(0);
  });

  it('broadcasts staff online status so the widget can show who is available', () => {
    const { deliver, broadcast } = setup();
    deliver({ type: 'user_status', payload: { userId: 'admin-a', isOnline: true } });
    expect(broadcast).toEqual([{ event: 'user_status', payload: { userId: 'admin-a', isOnline: true } }]);
  });

  it('sends a closed ticket to its customer and staff, never to everyone', async () => {
    const { gateway, chatBridge, toRoom, broadcast } = setup();
    const ticket: any = { id: 't1', customerId: 'customer-1' };
    gateway.notifyTicketClosed(ticket);
    expect(broadcast).toHaveLength(0);
    expect(toRoom).toContainEqual({ room: 'user:customer-1', event: 'ticket_closed', payload: ticket });
    expect(chatBridge.publish).toHaveBeenCalledWith({ type: 'ticket_closed', payload: ticket });
  });

  it('sends a new ticket to staff only', () => {
    const { gateway, chatBridge, broadcast } = setup();
    const ticket: any = { id: 't1', customerId: 'customer-1' };
    gateway.notifyTicketCreated(ticket);
    expect(broadcast).toHaveLength(0);
    expect(chatBridge.publish).toHaveBeenCalledWith({ type: 'ticket_created', payload: ticket });
  });
});
