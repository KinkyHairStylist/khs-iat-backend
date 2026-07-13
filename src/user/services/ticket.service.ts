// import { Injectable, NotFoundException } from '@nestjs/common';
// import { InjectRepository } from '@nestjs/typeorm';
// import { Repository } from 'typeorm';

// import {
//   ConversationCategory,
//   SupportTicket,
// } from '../../all_user_entities/support-ticket.entity';
// import { LiveChatMessage } from '../../all_user_entities/user_status.entity';
// import { User } from '../../all_user_entities/user.entity';
// import { CreateSupportTicketDto } from '../dtos/create-support-ticket.dto';

// @Injectable()
// export class TicketService {
//   constructor(
//     @InjectRepository(SupportTicket)
//     private readonly ticketRepo: Repository<SupportTicket>,

//     @InjectRepository(LiveChatMessage)
//     private readonly chatRepo: Repository<LiveChatMessage>,
//   ) {}

//   async createSupportTicket(dto: CreateSupportTicketDto, user: User) {
//     const ticket = this.ticketRepo.create({
//       userName: dto.userName || `${user.firstName} ${user.surname}`,
//       userEmail: dto.userEmail || user.email,
//       category: dto.category,
//       lastMessage: dto.message,
//       status: 'open',
//     });

//     const savedTicket = await this.ticketRepo.save(ticket);

//     // Save the first message under this ticket
//     const message = this.chatRepo.create({
//       sender: 'user',
//       text: dto.message,
//       ticket: savedTicket,
//     });

//     await this.chatRepo.save(message);

//     return {
//       message: 'Support ticket created successfully',
//       ticket: savedTicket,
//     };
//   }

//   /**
//    * 🧾 Get a single ticket with its live chat messages
//    */
//   async getTicketById(id: string, user: User): Promise<SupportTicket> {
//     const ticket = await this.ticketRepo.findOne({
//       where: { id, userEmail: user.email },
//       relations: ['messages'],
//       order: { messages: { timestamp: 'ASC' } },
//     });

//     if (!ticket) throw new NotFoundException('Ticket not found');
//     return ticket;
//   }

//   /**
//    * 📋 Get all tickets belonging to authenticated user
//    */
//   async getUserTickets(user: User): Promise<SupportTicket[]> {
//     return this.ticketRepo.find({
//       where: { userEmail: user.email },
//       relations: ['messages'],
//       order: { createdAt: 'DESC' },
//     });
//   }

//   /**
//    * 💬 Get all messages for a single ticket
//    */
//   async getTicketMessages(ticketId: string, user: User): Promise<LiveChatMessage[]> {
//     const ticket = await this.ticketRepo.findOne({
//       where: { id: ticketId, userEmail: user.email },
//     });

//     if (!ticket) throw new NotFoundException('Ticket not found');

//     return this.chatRepo.find({
//       where: { ticket: { id: ticket.id } },
//       order: { timestamp: 'ASC' },
//     });
//   }
// }
