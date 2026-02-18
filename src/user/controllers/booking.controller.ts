import { Controller, Post, Body, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { Role } from 'src/middleware/role.enum';
import { RolesGuard } from 'src/middleware/roles.guard';
import { Roles } from 'src/middleware/roles.decorator';
import { BookingService } from '../services/booking.service';
import { CreateBookingDto } from '../dtos/create-booking.dto';
import { ConfirmBookingDto } from '../dtos/confirm-booking.dto';
import { RateBusinessDto } from '../dtos/rate-business.dto';
import { CancelBookingDto } from '../dtos/cancel-booking.dto';
import { GetUser } from 'src/middleware/get-user.decorator';
import { User } from 'src/all_user_entities/user.entity';
import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';

@ApiTags('Bookings')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Client)
@Controller('/bookings')
export class BookingController {
  constructor(private bookingService: BookingService) {}

  // Create a new booking
  @Post('create')
  @ApiOperation({ summary: 'Create a new booking' })
  @ApiResponse({ status: 201, description: 'The booking has been successfully created.' })
  @ApiBody({ type: CreateBookingDto })
  async createBooking(@Body() createBookingDto: CreateBookingDto, @GetUser() user: User) {
    return this.bookingService.createBooking(createBookingDto, user);
  }

  // Confirm a booking
  @Post('confirm')
  @ApiOperation({ summary: 'Confirm a booking with payment options' })
  @ApiBody({ type: ConfirmBookingDto })
  async confirmBooking(@Body() confirmBookingDto: ConfirmBookingDto, @GetUser() user: User) {
    return this.bookingService.confirmBooking(confirmBookingDto, user);
  }

  // Get bookings for the authenticated user
  @Get('me')
  @ApiOperation({ summary: 'Get all bookings for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Bookings retrieved successfully' })
  async getMyBookings(@GetUser() user: User) {
    return this.bookingService.getUserBookings(user.id);
  }

  // Get user bookings (admin use - secured by roles)
  @Get('user/:userId')
  @ApiOperation({ summary: 'Get all bookings for a user' })
  async getUserBookings(@Param('userId') userId: string) {
    return this.bookingService.getUserBookings(userId);
  }

  // Get single booking details
  @Get(':orderId')
  @ApiOperation({ summary: 'Get single booking details by ID' })
  async getBookingById(@Param('orderId') orderId: string) {
    return this.bookingService.getBookingById(orderId);
  }

  // Cancel booking
  @Patch(':orderId/cancel')
  @ApiOperation({ summary: 'Cancel a booking with optional note' })
  @ApiBody({ type: CancelBookingDto })
  @ApiResponse({ status: 200, description: 'Booking cancelled successfully' })
  async cancelBooking(@Param('orderId') orderId: string, @Body() cancelBookingDto: CancelBookingDto) {
    return this.bookingService.cancelBooking(orderId, cancelBookingDto.cancellationsNote, cancelBookingDto.acceptedTerms);
  }

  // Restore cancelled booking
  @Patch(':orderId/restore')
  @ApiOperation({ summary: 'Restore a cancelled booking' })
  @ApiResponse({ status: 200, description: 'Booking restored successfully' })
  async restoreBooking(@Param('orderId') orderId: string) {
    return this.bookingService.restoreBooking(orderId);
  }

  // Rate booking business
  @Post(':orderId/rate')
  @ApiOperation({ summary: 'Rate a business for a specific booking' })
  @ApiBody({ type: RateBusinessDto })
  @ApiResponse({ status: 201, description: 'Business rated successfully' })
  async rateBusiness(@Param('orderId') orderId: string, @Body() rateBusinessDto: RateBusinessDto, @GetUser() user: User) {
    return this.bookingService.rateBusiness(orderId, rateBusinessDto.rating, rateBusinessDto.comment, user);
  }

  //  Reschedule booking
  @Patch(':orderId/reschedule')
  @ApiOperation({ summary: 'Reschedule a booking' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        newDate: { type: 'string', example: '2025-11-10' },
        newTime: { type: 'string', example: '14:00' },
      },
    },
  })
  async rescheduleBooking(
    @Param('orderId') orderId: string,
    @Body('newDate') newDate: string,
    @Body('newTime') newTime: string,
  ) {
    return this.bookingService.rescheduleBooking(orderId, new Date(newDate), newTime);
  }

  // (Existing) Get salon time slots (static example)
  @Get('salon/:salonId')
  async getSalonBookings() {
    return {
      availableDates: ['2025-08-27', '2025-08-28', '2025-08-29', '2025-08-30'],
      timeSlots: [
        '9:00 AM',
        '9:15 AM',
        '9:30 AM',
        '9:45 AM',
        '10:00 AM',
        '10:15 AM',
        '10:30 AM',
        '10:45 AM',
      ],
    };
  }
}
