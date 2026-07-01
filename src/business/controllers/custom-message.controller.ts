import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { CustomMessageService } from '../services/custom-message.service';
import { SendCustomMessageDto } from '../dtos/requests/CustomMesssageDto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { RolesGuard } from 'src/middleware/roles.guard';
import { Role } from 'src/middleware/role.enum';
import { Roles } from 'src/middleware/roles.decorator';

@ApiTags('Business Custom Message')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Business, Role.SuperAdmin)
@Controller('custom-messages')
export class CustomMessageController {
  constructor(private readonly customMessageService: CustomMessageService) {}

  @Post('/send-email')
  async sendCustomMessageEmail(
    @Request() req,
    @Body() customMessageData: SendCustomMessageDto,
  ) {
    const result =
      await this.customMessageService.sendCustomMessage(customMessageData);

    if (!result.success) {
      throw new HttpException(result.message, HttpStatus.BAD_REQUEST);
    }

    return result;
  }
}
