import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../middleware/jwt-auth.guard';
import { User } from 'src/all_user_entities/user.entity';
import { BusinessService } from '../services/business.service';
import { CreateBusinessDto } from '../dtos/requests/CreateBusinessDto';
import { BookingPoliciesData, BusinessServiceData } from '../types/constants';
import { Public } from '../middlewares/public.decorator';
import { CreateBlockedTimeDto } from '../dtos/requests/CreateBlockedTimeDto';
import { CreateServiceDto } from '../dtos/requests/CreateServiceDto';
import { CreateStaffDto } from '../dtos/requests/AddStaffDto';
import { EditStaffDto } from '../dtos/requests/EditStaffDto';
import { UpdateBusinessCategoryDto } from '../dtos/update-business-category.dto';
import { RemoveBusinessCategoriesDto } from '../dtos/remove-business-categories.dto';
import { UpdateServiceDto } from '../dtos/update-service.dto';
import { DeleteServiceDto } from '../dtos/delete-service.dto';
import { AssignStaffToServiceDto } from '../dtos/assign-staff-to-service.dto';
import { RolesGuard } from 'src/middleware/roles.guard';
import { Role } from 'src/middleware/role.enum';
import { Roles } from 'src/middleware/roles.decorator';
import { PermissionsGuard } from 'src/middleware/permissions.guard';
import { RequirePermission } from 'src/middleware/require-permission.decorator';
import { Permission } from 'src/middleware/permissions.enum';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EmailService } from '../../email/email.service';
import { BusinessCategory, BUSINESS_CATEGORIES } from '../types/category.enum';

interface RequestWithUser extends Request {
  user: User;
}

@ApiTags('Business')
@Controller('business')
export class BusinessController {
  constructor(
    private readonly businessService: BusinessService,
    private readonly emailService: EmailService,
  ) {}

  // ── BOOKINGS ──────────────────────────────────────────────────────────────

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.Merchant, Role.Staff, Role.BusinessStaff)
  @RequirePermission(Permission.VIEW_BOOKINGS)
  @Post('getBookings')
  async getBookings(@Req() req: RequestWithUser) {
    return this.businessService.getBookings(req.user.id);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.Merchant, Role.Staff, Role.BusinessStaff)
  @RequirePermission(Permission.MANAGE_BOOKINGS)
  @Post('completeBooking/:id')
  async completeBooking(@Param('id') id: string) {
    return this.businessService.completeBooking(id);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.Merchant, Role.Staff, Role.BusinessStaff)
  @RequirePermission(Permission.VIEW_BOOKINGS)
  @Post('getRescheduledBookings')
  async getRescheduledBookings(@Req() req: RequestWithUser) {
    return this.businessService.getRescheduledBookings(req.user.id);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.Merchant, Role.Staff, Role.BusinessStaff)
  @RequirePermission(Permission.VIEW_BOOKINGS)
  @Get('available-slots')
  async getAvailableSlots(
    @Req() req: RequestWithUser,
    @Query('date') date: string,
  ) {
    if (!date) throw new BadRequestException('Date query parameter is required');
    return this.businessService.getAvailableSlotsForDate(req.user.email, date);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.Merchant, Role.Staff, Role.BusinessStaff)
  @RequirePermission(Permission.MANAGE_BOOKINGS)
  @Post('rescheduleBooking')
  async rescheduleBooking(
    @Body() body: { id: string; reason: string; date: string; time: string },
  ) {
    return this.businessService.rescheduleBooking(body);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.Merchant, Role.Staff, Role.BusinessStaff)
  @RequirePermission(Permission.MANAGE_BOOKINGS)
  @Post('acceptBooking/:id')
  async acceptBooking(@Param('id') id: string) {
    return this.businessService.acceptBooking(id);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.Merchant, Role.Staff, Role.BusinessStaff)
  @RequirePermission(Permission.MANAGE_BOOKINGS)
  @Post('rejectBooking/:id')
  async rejectBooking(@Param('id') id: string) {
    return this.businessService.rejectBooking(id);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.Merchant, Role.Staff, Role.BusinessStaff)
  @RequirePermission(Permission.VIEW_BOOKINGS)
  @Get('getBooking/:id')
  async getBooking(@Param('id') id: string) {
    return this.businessService.getBooking(id);
  }

  // ── BLOCKED TIME / SCHEDULE ───────────────────────────────────────────────

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.Merchant, Role.Staff, Role.BusinessStaff)
  @RequirePermission(Permission.MANAGE_OWN_SCHEDULE)
  @Post('blockTime')
  async createBlockedTime(
    @Body() body: CreateBlockedTimeDto,
    @Req() req: RequestWithUser,
  ) {
    body.ownerMail = req.user.email;
    return this.businessService.createBlockedTime(body);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.Merchant, Role.Staff, Role.BusinessStaff)
  @RequirePermission(Permission.MANAGE_OWN_SCHEDULE)
  @Post('editBlockTime/:id')
  async editBlockedTime(
    @Param('id') id: string,
    @Body() body: CreateBlockedTimeDto,
    @Req() req: RequestWithUser,
  ) {
    body.ownerMail = req.user.email;
    return this.businessService.editBlockedTime(id, body);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.Merchant, Role.Staff, Role.BusinessStaff)
  @RequirePermission(Permission.MANAGE_OWN_SCHEDULE)
  @Post('deleteBlockedSlot/:id')
  async deleteBlockedSlot(@Param('id') id: string) {
    return this.businessService.deleteBlockedSlot(id);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.Merchant, Role.Staff, Role.BusinessStaff)
  @RequirePermission(Permission.VIEW_BOOKINGS)
  @Get('getBlockedSlots')
  async getBlockedSlots(@Req() req: RequestWithUser) {
    return this.businessService.getBlockedSlots(req.user.email);
  }

  // ── STAFF ─────────────────────────────────────────────────────────────────

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.Merchant, Role.Staff, Role.BusinessStaff)
  @RequirePermission(Permission.MANAGE_STAFF)
  @Post('addStaff')
  async addStaff(@Req() req: RequestWithUser, @Body() body: CreateStaffDto) {
    return this.businessService.addStaff(req.user.email, body);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.Merchant, Role.Staff, Role.BusinessStaff)
  @RequirePermission(Permission.MANAGE_STAFF)
  @Post('editStaff/:staffId')
  async editStaff(
    @Param('staffId') staffId: string,
    @Body() body: EditStaffDto,
  ) {
    return this.businessService.editStaff(staffId, body);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.Merchant, Role.Staff, Role.BusinessStaff)
  @RequirePermission(Permission.MANAGE_STAFF)
  @Post('deactivateStaff/:id')
  async deactivateStaff(@Param('id') id: string) {
    return this.businessService.deactivateStaff(id);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.Merchant, Role.Staff, Role.BusinessStaff)
  @RequirePermission(Permission.VIEW_STAFF)
  @Get('getTeamMembers')
  async getTeamMembers(@Req() req: RequestWithUser) {
    return this.businessService.getTeamMembers(req.user.email);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.Merchant, Role.Staff, Role.BusinessStaff)
  @RequirePermission(Permission.MANAGE_STAFF)
  @Post('assign-staff-to-service')
  async assignStaffToService(
    @Req() req: RequestWithUser,
    @Body() body: AssignStaffToServiceDto,
  ) {
    return this.businessService.assignStaffToService(body);
  }

  // ── SERVICES ──────────────────────────────────────────────────────────────

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.Merchant, Role.Staff, Role.BusinessStaff)
  @RequirePermission(Permission.VIEW_SERVICES)
  @Get('getServices')
  async getBusinessServices(@Req() req: RequestWithUser) {
    return this.businessService.getBusinessServices(req.user.email);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.Merchant, Role.Staff, Role.BusinessStaff)
  @RequirePermission(Permission.MANAGE_SERVICES)
  @Post('createService')
  async createService(
    @Req() req: RequestWithUser,
    @Body() body: CreateServiceDto,
  ) {
    body.userMail = req.user.email;
    return this.businessService.createService(body);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.Merchant, Role.Staff, Role.BusinessStaff)
  @RequirePermission(Permission.MANAGE_SERVICES)
  @Put('update-service/:serviceId')
  async updateService(
    @Param('serviceId') serviceId: string,
    @Req() req: RequestWithUser,
    @Body() body: UpdateServiceDto,
  ) {
    return this.businessService.updateService(serviceId, body);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.Merchant, Role.Staff, Role.BusinessStaff)
  @RequirePermission(Permission.VIEW_SERVICES)
  @Get('categories')
  @HttpCode(HttpStatus.OK)
  getCategories() {
    return BUSINESS_CATEGORIES;
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.Merchant, Role.Staff, Role.BusinessStaff)
  @RequirePermission(Permission.MANAGE_SERVICES)
  @Post('update-category')
  async updateBusinessCategory(
    @Req() req: RequestWithUser,
    @Body() body: UpdateBusinessCategoryDto,
  ) {
    return this.businessService.updateBusinessCategory(req.user.id, body.categories);
  }

  // Merchant/Staff only — too destructive for BusinessStaff
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Merchant, Role.Staff)
  @Post('remove-categories')
  async removeBusinessCategories(
    @Req() req: RequestWithUser,
    @Body() body: RemoveBusinessCategoriesDto,
  ) {
    return this.businessService.removeBusinessCategories(req.user.id, body.categoriesToRemove);
  }

  // Merchant/Staff only — destructive
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Merchant, Role.Staff)
  @Delete('delete-service/:serviceId')
  async deleteService(
    @Param('serviceId') serviceId: string,
    @Req() req: RequestWithUser,
    @Body() body: DeleteServiceDto,
  ) {
    return this.businessService.deleteService(body);
  }

  // ── REPORTS / DETAILS ─────────────────────────────────────────────────────

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.Merchant, Role.Staff, Role.BusinessStaff)
  @RequirePermission(Permission.VIEW_REPORTS)
  @Get('getAdvertisementPlans')
  async getAdvertisementPlans() {
    return this.businessService.getAdvertisementPlans();
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(Role.Merchant, Role.Staff, Role.BusinessStaff)
  @RequirePermission(Permission.VIEW_REPORTS)
  @Get('business-details')
  async getBusinessDetails(@Req() req: RequestWithUser) {
    return this.businessService.getBusinessDetails(req.user.id);
  }

  // Any authenticated user — public business profile by ID
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Get(':id/info')
  async getBusinessPublicInfo(@Param('id') id: string) {
    return this.businessService.getBusinessPublicInfo(id);
  }

  // Merchant/Staff only — sensitive financial/owner data
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Merchant, Role.Staff)
  @Get('owner-details')
  async getBusinessOwnerDetails(@Req() req: RequestWithUser) {
    return this.businessService.getBusinessOwnerDetails(req.user.id);
  }

  // ── BUSINESS SETUP ────────────────────────────────────────────────────────

  @Post('create')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Customer, Role.Merchant)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createBusinessDto: CreateBusinessDto,
    @Req() req: RequestWithUser,
  ) {
    const business = await this.businessService.create(createBusinessDto, req.user);
    return {
      message: 'Business created successfully.',
      businessId: business.id,
      businessName: business.businessName,
    };
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Customer, Role.Merchant, Role.Staff)
  @Get('has-business')
  async hasBusiness(@Req() req: RequestWithUser) {
    return this.businessService.hasBusiness(req.user.id);
  }

  // ── PUBLIC ────────────────────────────────────────────────────────────────

  @Public()
  @Get('/business/list-services')
  @HttpCode(HttpStatus.OK)
  getServices(): BusinessServiceData[] {
    return this.businessService.getServices();
  }

  @Public()
  @Get('/business/list-booking-policies')
  @HttpCode(HttpStatus.OK)
  getBookingPoliciesConfigs(): BookingPoliciesData[] {
    return this.businessService.getBookingPoliciesConfiguration();
  }

  @Get('/ping')
  ping() {
    return 'server is live';
  }

  @Get('/sendMail')
  async sendMail() {
    const staffEmail = 'ola-israel.528@jesuitmemorial.org';
    const firstName = 'jesse';
    const business = { businessName: 'Natures Gentle touch' };
    const tempPassword = 'secure';
    try {
      await this.emailService.sendStaffWelcomeEmail(
        staffEmail,
        firstName,
        business.businessName,
        tempPassword,
      );
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
    }
  }
}
