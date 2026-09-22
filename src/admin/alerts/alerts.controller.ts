import { Controller, Get, Post, Patch, Body, Param, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { Roles } from 'src/middleware/roles.decorator';
import { Role } from 'src/middleware/role.enum';
import { RolesGuard } from 'src/middleware/roles.guard';
import { AlertsService } from './alerts.service';
import { CreateAlertDto } from './dto/create-alert.dto';

@ApiTags('Admin Alerts')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Staff)
@Controller('/admin/alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  async getAll() {
    return this.alertsService.findAllForAdmin();
  }

  @Post()
  async create(@Body() dto: CreateAlertDto, @Req() req: { user?: { id?: string } }) {
    return this.alertsService.create(dto, req.user?.id);
  }

  @Patch(':id/deactivate')
  async deactivate(@Param('id') id: string) {
    return this.alertsService.deactivate(id);
  }
}
