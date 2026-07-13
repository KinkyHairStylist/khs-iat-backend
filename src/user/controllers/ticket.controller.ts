// import { Controller, Get, Param, UseGuards, Post, Body } from '@nestjs/common';
// import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse  } from '@nestjs/swagger';

// import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
// import { GetUser } from 'src/middleware/get-user.decorator';
// import { User } from 'src/all_user_entities/user.entity';
// import { TicketService } from '../services/ticket.service';
// import { CreateSupportTicketDto } from '../dtos/create-support-ticket.dto';

// @ApiTags('Customers Support Tickets')
// @ApiBearerAuth('access-token')
// @UseGuards(JwtAuthGuard)
// @Controller('customer/support/tickets')
// export class TicketController {
//   constructor(private readonly ticketService: TicketService) {}

//   @Post('create')
//   @ApiOperation({ summary: 'Create a new support ticket' })
//   @ApiResponse({ status: 201, description: 'Support ticket created successfully' })
//   async createTicket(@Body() dto: CreateSupportTicketDto, @GetUser() user: User) {
//     return this.ticketService.createSupportTicket(dto, user);
//   }

//   @Get()
//   @ApiOperation({ summary: 'Get all tickets for authenticated user' })
//   async getUserTickets(@GetUser() user: User) {
//     return this.ticketService.getUserTickets(user);
//   }

//   @Get(':id/messages')
//   @ApiOperation({ summary: 'Get chat messages for a specific ticket' })
//   async getMessages(@Param('id') id: string, @GetUser() user: User) {
//     return this.ticketService.getTicketMessages(id, user);
//   }

//   @Get(':id')
//   @ApiOperation({ summary: 'Get single ticket details (with messages)' })
//   async getTicket(@Param('id') id: string, @GetUser() user: User) {
//     return this.ticketService.getTicketById(id, user);
//   }
// }
