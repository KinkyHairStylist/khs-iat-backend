import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Delete,
  HttpCode,
  HttpStatus,
  Logger,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { PaymentService } from './payment.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { Roles } from 'src/middleware/roles.decorator';
import { Role } from 'src/middleware/role.enum';
import { RolesGuard } from 'src/middleware/roles.guard';

@ApiTags('Admin All Transactions')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin, Role.SuperAdmin, Role.Client)
@Controller('admin/payments')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(private readonly paymentService: PaymentService) {}

  @Get('payment-methods')
  async paymentMethods() {
    return this.paymentService.getPaymentMethodStats();
  }

  @Post('create')
  async createPayment(@Body() dto: CreatePaymentDto) {
    try {
      this.logger.log(`Creating Paystack payment for business`);

      const result = await this.paymentService.createPaystackPayment(dto);

      return {
        success: true,
        data: {
          authorizationUrl: result.authorizationUrl,
          reference: result.reference,
          payment: result.payment,
        },
        message: 'Proceeding to checkout to complete payment',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: error.message,
      };
    }
  }

  @Patch('/verify/:txReference')
  async verifyPayment(@Param('txReference') txReference: string) {
    try {
      const result =
        await this.paymentService.verifyPaystackWebhookPayment(txReference);

      return {
        success: true,
        data: result.payment,
        message: result.message,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: error.message,
      };
    }
  }

  @Get()
  findAll() {
    return this.paymentService.getAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.paymentService.getOne(id);
  }

  @Post('refund')
  @HttpCode(HttpStatus.OK)
  async refund(@Body() dto: RefundPaymentDto) {
    const payment = await this.paymentService.refund(dto);
    return { success: true, data: payment, message: 'Refund successful' };
  }

  @Get('disputes/all')
  getDisputes() {
    return this.paymentService.getDisputes();
  }

  @Delete('delete-all')
  async deleteAllPayments() {
    await this.paymentService.deleteAllPayments();
    return { success: true, message: 'All payments deleted' };
  }
}
