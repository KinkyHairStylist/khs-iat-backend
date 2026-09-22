import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { Roles } from 'src/middleware/roles.decorator';
import { Role } from 'src/middleware/role.enum';
import { RolesGuard } from 'src/middleware/roles.guard';
import { AdminMerchantMembershipsService } from '../services/admin-merchant-memberships.service';
import { AdminCreateMerchantMembershipDto } from '../dtos/admin-merchant-membership.dto';

interface RequestWithUser extends Request {
  user: { id: string; email: string };
}

// The membership packages salons sell to their own clients, seen and managed by an admin.
@ApiTags('Admin Merchant Memberships')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Staff)
@Controller('admin/merchant-memberships')
export class AdminMerchantMembershipsController {
  constructor(private readonly memberships: AdminMerchantMembershipsService) {}

  @Get()
  overview() {
    return this.memberships.overview();
  }

  @Get('salons')
  salons() {
    return this.memberships.listSalons();
  }

  @Get('salons/:businessId/services')
  services(@Param('businessId', new ParseUUIDPipe()) businessId: string) {
    return this.memberships.listServices(businessId);
  }

  @Post()
  create(@Body() body: AdminCreateMerchantMembershipDto, @Req() req: RequestWithUser) {
    return this.memberships.create(body, req.user?.email);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: RequestWithUser) {
    return this.memberships.deactivate(id, req.user?.email);
  }
}
