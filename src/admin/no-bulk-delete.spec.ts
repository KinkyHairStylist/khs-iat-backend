import 'reflect-metadata';
import { ClientController } from 'src/business/controllers/client.controller';
import { ClientService } from 'src/business/services/client.service';
import { ReviewService } from 'src/business/services/review.service';
import { WithdrawalController } from './withdrawal/withdrawal.controller';
import { WithdrawalService } from './withdrawal/withdrawal.service';
import { PaymentController } from './payment/payment.controller';

// Endpoints that wipe a whole table (or truncate it with everything that points at it) have been
// removed. These checks stop them coming back.

describe('no endpoint wipes a whole table', () => {
  it.each([
    ['ClientController', ClientController, 'deleteAllClients'],
    ['ClientService', ClientService, 'clearAllClients'],
    ['ReviewService', ReviewService, 'clearAllReviews'],
    ['WithdrawalController', WithdrawalController, 'deleteAll'],
    ['WithdrawalService', WithdrawalService, 'deleteAll'],
    ['PaymentController', PaymentController, 'deleteAll'],
  ])('%s has no %s', (_name, type: any, method) => {
    expect(type.prototype[method]).toBeUndefined();
  });
});
