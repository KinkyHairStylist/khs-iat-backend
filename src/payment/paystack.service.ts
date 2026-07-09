import { Injectable, BadRequestException } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class PaystackService {
  private readonly secretKey = process.env.PAYSTACK_SECRET_KEY;
  private readonly baseUrl = process.env.PAYSTACK_BASE_URL;

  constructor() {
    if (!this.secretKey) {
      throw new Error('PAYSTACK_SECRET_KEY must be set');
    }
  }

  /** Initialize Paystack Payment */
  async initializePayment(payload: {
    email: string;
    amount: number; // in kobo
    callback_url?: string;
    metadata?: any;
  }) {
    try {
      // Validate required parameters
      if (!payload.email || typeof payload.email !== 'string') {
        throw new BadRequestException('Valid email is required');
      }
      if (!payload.amount || payload.amount <= 0) {
        throw new BadRequestException('Amount must be greater than 0');
      }
      if (!Number.isInteger(payload.amount)) {
        throw new BadRequestException('Amount must be an integer (in kobo)');
      }
      if (!this.baseUrl) {
        throw new BadRequestException('Paystack base URL not configured');
      }

      const res = await axios.post(
        `${this.baseUrl}/transaction/initialize`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000, // 30 second timeout
        },
      );

      return res.data.data;
    } catch (error) {
      console.error('Paystack initialization error:', error.response?.data || error.message);

      if (error instanceof BadRequestException) {
        throw error;
      }

      if (error.response?.status === 400) {
        throw new BadRequestException(`Paystack validation error: ${error.response?.data?.message || 'Invalid request parameters'}`);
      }

      if (error.response?.status === 401) {
        throw new BadRequestException('Paystack authentication failed - check secret key');
      }

      if (error.response?.status === 500) {
        throw new BadRequestException('Paystack server error');
      }

      throw new BadRequestException(`Unable to initialize Paystack payment: ${error.message}`);
    }
  }

  /** Verify Paystack Payment */
  async verifyPayment(reference: string) {
    try {
      const res = await axios.get(
        `${this.baseUrl}/transaction/verify/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
          },
        },
      );

      return res.data.data;
    } catch (error) {
      throw new BadRequestException('Unable to verify Paystack payment');
    }
  }
}
