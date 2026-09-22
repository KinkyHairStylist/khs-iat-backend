import { Body, Controller, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { Roles } from 'src/middleware/roles.decorator';
import { Role } from 'src/middleware/role.enum';
import { RolesGuard } from 'src/middleware/roles.guard';
import { AdminUserCreationService } from '../services/admin-user-creation.service';
import { AdminCreateUserDto, AdminMakeMerchantDto } from '../dtos/admin-create-user.dto';

interface RequestWithUser extends Request {
  user: { id: string; email: string };
}

// Adding users and turning a customer or admin into a merchant.
@ApiTags('Admin User Management')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Staff)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly creation: AdminUserCreationService) {}

  @Post()
  create(@Body() body: AdminCreateUserDto, @Req() req: RequestWithUser) {
    return this.creation.createUser(body, req.user?.email);
  }

  @Post(':id/merchant')
  makeMerchant(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: AdminMakeMerchantDto,
    @Req() req: RequestWithUser,
  ) {
    return this.creation.makeMerchant(id, body.business, req.user);
  }
}
