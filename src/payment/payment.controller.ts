import { Controller, Post, Param, Body, Logger, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { Public } from 'src/business/middlewares/public.decorator';
import { PaymentService } from './payment.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { Roles } from 'src/middleware/roles.decorator';
import { Role } from 'src/middleware/role.enum';
import { RolesGuard } from 'src/middleware/roles.guard';

// Customer checkout (Paystack). The staff side of payments — the ledger,
// totals, refunds, disputes — moved to khs-iat-staff-be.
//
// These two routes used to live under admin/payments. They answer on the new
// /payments path and, until every client has moved to it, on the old one too.
@ApiTags('Payments')
@Controller(['payments', 'admin/payments'])
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(private readonly paymentService: PaymentService) {}

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Client)
  @Post('create')
  async createPayment(@Body() dto: CreatePaymentDto) {
    this.logger.log(`PAYSTACK: Creating payment for business`);
    const result = await this.paymentService.createPaystackPayment(dto);
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

  /** After the customer returns from Paystack. */
  @Public()
  @Patch('/verify/:txReference')
  async verifyPayment(@Param('txReference') txReference: string) {
    const result = await this.paymentService.verifyPaystackWebhookPayment(txReference);
    return {
      success: true,
      data: result.payment,
      message: result.message,
    };
  }
}
