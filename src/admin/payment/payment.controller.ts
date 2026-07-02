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
import { Public } from 'src/business/middlewares/public.decorator';
import { PaymentService } from './payment.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { Roles } from 'src/middleware/roles.decorator';
import { Role } from 'src/middleware/role.enum';
import { RolesGuard } from 'src/middleware/roles.guard';

@ApiTags('Admin All Transactions')
@Controller('admin/payments')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(private readonly paymentService: PaymentService) {}

  /**
   * Step 1: Create PayPal Order
   *
   * POST /payments/paypal/create
   *
   * Body: {
   *   "client": "John Doe",
   *   "businessId": "uuid-here",
   *   "business": "My Business",
   *   "amount": 100.00,
   *   "method": "paypal"
   * }
   *
   * Response: {
   *   "success": true,
   *   "approvalUrl": "https://paypal.com/approve?token=...",
   *   "orderId": "ORDER_ID",
   *   "message": "Redirect user to approval URL"
   * }
   */

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin, Role.SuperAdmin, Role.Client)
  @Get('payment-methods')
  async paymentMethods() {
    return this.paymentService.getPaymentMethodStats();
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin, Role.SuperAdmin, Role.Client)
  @Post('create')
  async createPayment(
    @Body()
    dto: CreatePaymentDto,
  ) {
    try {
      this.logger.log(
        `${dto.method.toUpperCase()}: Creating payment for business`,
      );

      let result;
      if (dto.method === 'paypal') {
        result = await this.paymentService.createPayPalPayment(dto);

        return {
          success: true,
          approvalUrl: result.approvalUrl,
          orderId: result.orderId,
          payment: result.payment,
          message: 'Redirect user to approval URL to complete payment',
        };
      } else if (dto.method === 'paystack') {
        result = await this.paymentService.createPaystackPayment(dto);

        return {
          success: true,
          data: {
            authorizationUrl: result.authorizationUrl,
            reference: result.reference,
            payment: result.payment,
          },
          message: 'Proceeding to Checkout to complete payment',
        };
      }
    } catch (error) {
      // this.logger.error('Payment creation failed', error);
      return {
        success: false,
        error: error.message,
        message: error.message,
      };
    }
  }

  /**
   * Step 2: Capture Payment (after user approves)
   *
   * POST /payments/paypal/capture/:orderId
   *
   * This should be called after the user returns from PayPal
   * (from the return_url with the orderId)
   *
   * Response: {
   *   "success": true,
   *   "captureId": "CAPTURE_ID",
   *   "status": "COMPLETED",
   *   "message": "Payment captured successfully"
   * }
   */
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin, Role.SuperAdmin, Role.Client)
  @Post('capture/:orderId')
  @HttpCode(HttpStatus.OK)
  async capturePayment(@Param('orderId') orderId: string) {
    try {
      this.logger.log(`Capturing payment for order: ${orderId}`);

      const result = await this.paymentService.capturePayment(orderId);

      return {
        success: true,
        captureId: result.captureId,
        status: result.status,
        amount: result.amount,
        businessId: result.businessId,
        message: 'Payment captured successfully. Webhook will update wallet.',
      };
    } catch (error) {
      this.logger.error('Payment capture failed', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Public()
  @Patch('/verify/:txReference')
  async verifyPayment(@Param('txReference') txReference: string) {
    try {
      const result =
        await this.paymentService.verifyPaystackWebhookPayment(txReference);

      const payment = result.payment;
      return {
        success: true,
        data: {
          status: payment.status,
          amount: payment.amount,
          currency: payment.currency,
          reason: payment.reason,
          createdAt: payment.createdAt,
          gatewayTransactionId: payment.gatewayTransactionId,
        },
        message: result.message,
      };
    } catch (error) {
      // this.logger.error('Payment creation failed', error);
      return {
        success: false,
        error: error.message,
        message: error.message,
      };
    }
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin, Role.SuperAdmin, Role.Client)
  @Get()
  findAll() {
    return this.paymentService.getAll();
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin, Role.SuperAdmin, Role.Client)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.paymentService.getOne(id);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin, Role.SuperAdmin, Role.Client)
  @Post('refund')
  refund(@Body() dto: RefundPaymentDto) {
    return this.paymentService.refund(dto);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin, Role.SuperAdmin, Role.Client)
  @Get('disputes/all')
  getDisputes() {
    return this.paymentService.getDisputes();
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin, Role.SuperAdmin, Role.Client)
  @Delete('delete-all')
  async deleteAllPayments() {
    return this.paymentService.deleteAllPayments();
  }
}
