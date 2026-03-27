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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {EmailService} from "../../email/email.service";
import { BusinessCategory, BUSINESS_CATEGORIES } from '../types/category.enum';

interface RequestWithUser extends Request {
  user: User;
}

@ApiTags('Business')
@Controller('business')
export class BusinessController {
  constructor(
      private readonly businessService: BusinessService,
      private readonly emailService:EmailService
  ) {}

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Business, Role.SuperAdmin,Role.Staff)
  @Post('getBookings')
  async getBookings(@Req() req: RequestWithUser) {
    const user = req.user.id;
    return this.businessService.getBookings(user);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Business, Role.SuperAdmin,Role.Staff)
  @Post('deactivateStaff/:id')
  async deactivateStaff(@Param('id') id: string) {
    return this.businessService.deactivateStaff(id);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Business, Role.SuperAdmin,Role.Staff)
  @Post('completeBooking/:id')
  async completeBooking(@Param('id') id: string) {
    return this.businessService.completeBooking(id);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Business, Role.SuperAdmin,Role.Staff)
  @Post('getRescheduledBookings')
  async getRescheduledBookings(@Req() req: RequestWithUser) {
    const user = req.user.id;
    return this.businessService.getRescheduledBookings(user);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Business, Role.SuperAdmin,Role.Staff)
  @Get('available-slots')
  async getAvailableSlots(
    @Req() req: RequestWithUser,
    @Query('date') date: string,
  ) {
    const userMail = req.user.email;

    if (!date) {
      throw new BadRequestException('Date query parameter is required');
    }

    return await this.businessService.getAvailableSlotsForDate(userMail, date);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Business, Role.SuperAdmin,Role.Staff)
  @Post('rescheduleBooking')
  async rescheduleBooking(
    @Body() body: { id: string; reason: string; date: string; time: string },
  ) {
    return await this.businessService.rescheduleBooking(body);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Business, Role.SuperAdmin,Role.Staff)
  @Post('blockTime')
  async createBlockedTime(
    @Body() body: CreateBlockedTimeDto,
    @Req() req: RequestWithUser,
  ) {
    body.ownerMail = req.user.email;
    return this.businessService.createBlockedTime(body);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Business, Role.SuperAdmin,Role.Staff)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Business, Role.SuperAdmin,Role.Staff)
  @Get('getAdvertisementPlans')
  async getAdvertisementPlans() {
    return this.businessService.getAdvertisementPlans();
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Business, Role.SuperAdmin,Role.Staff)
  @Get('getTeamMembers')
  async getTeamMembers(@Req() req: RequestWithUser) {
    const userMail = req.user.email;
    return this.businessService.getTeamMembers(userMail);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Business, Role.SuperAdmin,Role.Staff)
  @Get('getServices')
  async getBusinessServices(@Req() req: RequestWithUser) {
    const userMail = req.user.email;
    return this.businessService.getBusinessServices(userMail);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Business, Role.SuperAdmin,Role.Staff)
  @Post('createService')
  async createService(
    @Req() req: RequestWithUser,
    @Body() body: CreateServiceDto,
  ) {
    body.userMail = req.user.email;
    return this.businessService.createService(body);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Business, Role.SuperAdmin,Role.Staff)
  @Get('getBooking/:id')
  async getBooking(@Param('id') id: string) {
    return this.businessService.getBooking(id);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Business, Role.SuperAdmin,Role.Staff)
  @Post('deleteBlockedSlot/:id')
  async deleteBlockedSlot(@Param('id') id: string) {
    return this.businessService.deleteBlockedSlot(id);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Business, Role.SuperAdmin,Role.Staff)
  @Post('addStaff')
  async addStaff(@Req() req: RequestWithUser, @Body() body: CreateStaffDto) {
    const userMail = req.user.email;
    return this.businessService.addStaff(userMail, body);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Business, Role.SuperAdmin,Role.Staff)
  @Get('getBlockedSlots')
  async getBlockedSlots(@Req() req: RequestWithUser) {
    const user = req.user.email;
    return this.businessService.getBlockedSlots(user);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Business, Role.SuperAdmin,Role.Staff)
  @Post('editStaff/:staffId')
  async editStaff(
    @Param('staffId') staffId: string,
    @Body() body: EditStaffDto,
  ) {
    return this.businessService.editStaff(staffId, body);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Business, Role.SuperAdmin,Role.Staff)
  @Post('acceptBooking/:id')
  async acceptBooking(@Param('id') id: string) {
    return this.businessService.acceptBooking(id);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Business, Role.SuperAdmin,Role.Staff)
  @Post('rejectBooking/:id')
  async rejectBooking(@Param('id') id: string) {
    return this.businessService.rejectBooking(id);
  }


  @Get('/sendMail')
  async sendMail(){
  const staffEmail = 'ola-israel.528@jesuitmemorial.org'
  console.log('lets go!')
    const firstName = 'jesse'
    const business = {businessName:"Natures Gentle touch"}
    const tempPassword = "secure"
    try {
      await this.emailService.sendStaffWelcomeEmail(
          staffEmail,
          firstName,
          business.businessName,
          tempPassword
      );

    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);

    }

  }

  @Post('create')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Client, Role.Business)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createBusinessDto: CreateBusinessDto,
    @Req() req: RequestWithUser,
  ) {
    const owner = req.user;

    const business = await this.businessService.create(
      createBusinessDto,
      owner,
    );

    return {
      message: 'Business created successfully.',
      businessId: business.id,
      businessName: business.businessName,
    };
  }

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

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Client, Role.Business, Role.SuperAdmin, Role.Staff)
  @Get('has-business')
  async hasBusiness(@Req() req: RequestWithUser) {
    const user = req.user;
    return this.businessService.hasBusiness(user.id);
  }

  @Get('/ping')
  ping() {
    console.log('yo');
    return 'server is live';
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Business, Role.SuperAdmin, Role.Staff)
  @Get('owner-details')
  async getBusinessOwnerDetails(@Req() req: RequestWithUser) {
    const user = req.user;
    return this.businessService.getBusinessOwnerDetails(user.id);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Business, Role.SuperAdmin, Role.Staff)
  @Get('business-details')
  async getBusinessDetails(@Req() req: RequestWithUser) {
    const user = req.user;
    return this.businessService.getBusinessDetails(user.id);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Business, Role.SuperAdmin, Role.Staff)
  @Get('categories')
  @HttpCode(HttpStatus.OK)
  getCategories() {
    return BUSINESS_CATEGORIES;
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Business, Role.SuperAdmin, Role.Staff)
  @Post('update-category')
  async updateBusinessCategory(
    @Req() req: RequestWithUser,
    @Body() body: UpdateBusinessCategoryDto
  ) {
    const user = req.user;
    return this.businessService.updateBusinessCategory(user.id, body.categories);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Business, Role.SuperAdmin, Role.Staff)
  @Post('remove-categories')
  async removeBusinessCategories(
    @Req() req: RequestWithUser,
    @Body() body: RemoveBusinessCategoriesDto
  ) {
    const user = req.user;
    return this.businessService.removeBusinessCategories(user.id, body.categoriesToRemove);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Business, Role.SuperAdmin, Role.Staff)
  @Put('update-service/:serviceId')
  async updateService(
    @Param('serviceId') serviceId: string,
    @Req() req: RequestWithUser,
    @Body() body: UpdateServiceDto
  ) {
    return this.businessService.updateService(serviceId, body);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Business, Role.SuperAdmin, Role.Staff)
  @Delete('delete-service/:serviceId')
  async deleteService(
    @Param('serviceId') serviceId: string,
    @Req() req: RequestWithUser,
    @Body() body: DeleteServiceDto
  ) {
    return this.businessService.deleteService(body);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Business, Role.SuperAdmin, Role.Staff)
  @Post('assign-staff-to-service')
  async assignStaffToService(
    @Req() req: RequestWithUser,
    @Body() body: AssignStaffToServiceDto
  ) {
    return this.businessService.assignStaffToService(body);
  }
}
