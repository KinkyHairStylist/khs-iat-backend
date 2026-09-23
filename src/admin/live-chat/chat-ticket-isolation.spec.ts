import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { TicketStatus } from 'src/all_user_entities/ticket.entity';

// A support ticket belongs to exactly one customer. None of these three
// actions checked that at all -- confirmed live against the real backend:
// a second, completely unrelated account could read a first account's full
// private conversation (including their name, email and phone), inject a
// message into it appearing to staff as an unrelated person joining the
// thread, and close it outright. Staff must keep unrestricted access
// (that's their job) -- only a customer/merchant is now checked against
// the ticket's own customerId.

const OWNER = { id: 'cust-owner', isStaff: false } as any;
const STRANGER = { id: 'cust-stranger', isStaff: false } as any;
const STAFF = { id: 'staff-1', isStaff: true } as any;

function setup(ticketOverrides: Partial<Record<string, any>> = {}) {
  const ticket = {
    id: 'ticket-1',
    customerId: OWNER.id,
    status: TicketStatus.OPEN,
    ...ticketOverrides,
  };

  const chatService: any = {
    getTicketById: jest.fn().mockResolvedValue(ticket),
    getSingleOpenTicketOrCreate: jest.fn().mockResolvedValue(ticket),
    getMessagesByTicket: jest.fn().mockResolvedValue([{ id: 'msg-1', message: 'secret' }]),
    storeMessage: jest.fn().mockResolvedValue({ id: 'msg-new', message: 'hi', createdAt: new Date() }),
    closeTicket: jest.fn().mockResolvedValue({ ...ticket, status: TicketStatus.CLOSED }),
  };
  const chatGateway: any = { sendMessageToReceiver: jest.fn(), notifyTicketClosed: jest.fn() };
  const cloudinary: any = { uploadBase64: jest.fn() };

  const controller = new ChatController(chatService, chatGateway, cloudinary);
  return { controller, chatService, chatGateway };
}

describe('getMessagesByTicket', () => {
  it("is refused for a customer who doesn't own the ticket, as if it didn't exist", async () => {
    const { controller } = setup();
    await expect(controller.getMessagesByTicket(STRANGER, 'ticket-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('is allowed for the ticket owner', async () => {
    const { controller } = setup();
    await expect(controller.getMessagesByTicket(OWNER, 'ticket-1')).resolves.toEqual([
      { id: 'msg-1', message: 'secret' },
    ]);
  });

  it("is allowed for staff regardless of who owns the ticket", async () => {
    const { controller } = setup();
    await expect(controller.getMessagesByTicket(STAFF, 'ticket-1')).resolves.toEqual([
      { id: 'msg-1', message: 'secret' },
    ]);
  });
});

describe('sendMessage', () => {
  it("refuses a customer injecting a message into someone else's ticket", async () => {
    const { controller } = setup();
    await expect(
      controller.sendMessage(STRANGER, {
        receiverId: 'admin-1',
        message: 'I should not be able to send this',
        ticketId: 'ticket-1',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows the ticket owner to send a message into their own ticket', async () => {
    const { controller, chatGateway } = setup();
    await controller.sendMessage(OWNER, {
      receiverId: 'admin-1',
      message: 'hello',
      ticketId: 'ticket-1',
    } as any);
    expect(chatGateway.sendMessageToReceiver).toHaveBeenCalled();
  });
});

describe('closeTicket', () => {
  it("refuses a customer closing someone else's ticket", async () => {
    const { controller } = setup();
    await expect(controller.closeTicket(STRANGER, 'ticket-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('allows the ticket owner to close their own ticket', async () => {
    const { controller, chatService } = setup();
    await controller.closeTicket(OWNER, 'ticket-1');
    expect(chatService.closeTicket).toHaveBeenCalledWith('ticket-1', OWNER.id);
  });

  it('allows staff to close any ticket', async () => {
    const { controller, chatService } = setup();
    await controller.closeTicket(STAFF, 'ticket-1');
    expect(chatService.closeTicket).toHaveBeenCalledWith('ticket-1', STAFF.id);
  });
});
