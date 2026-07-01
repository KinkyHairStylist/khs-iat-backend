import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { CommunicationService } from '../services/communication.service';
import {
  SendBulkMessageDto,
  SendDirectMessageDto,
} from '../dtos/requests/CommunicationDto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { RolesGuard } from 'src/middleware/roles.guard';
import { Role } from 'src/middleware/role.enum';
import { Roles } from 'src/middleware/roles.decorator';

@ApiTags('Business Communication')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Business, Role.SuperAdmin)
@Controller('communications')
export class CommunicationController {
  constructor(private readonly communicationService: CommunicationService) {}

  @Post('/send-direct-message')
  async sendCommunicationDirectMessage(
    @Request() req,
    @Body() directMessageData: SendDirectMessageDto,
  ) {
    const result =
      await this.communicationService.sendDirectMessage(directMessageData);

    if (!result.success) {
      throw new HttpException(result.message, HttpStatus.BAD_REQUEST);
    }

    return result;
  }

  @Post('/send-bulk-messages')
  async sendCommunicationBulkMessages(
    @Request() req,
    @Body() bulkMessagesData: SendBulkMessageDto,
  ) {
    const result =
      await this.communicationService.sendBulkCustomMessages(bulkMessagesData);

    if (!result.success) {
      throw new HttpException(result.message, HttpStatus.BAD_REQUEST);
    }

    return result;
  }
}
