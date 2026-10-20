import { Router } from "express";
import * as wallet from "../../controllers/merchant/walletController";
import { authenticateMerchant } from "../../middlewares/authenticate";
import { createRateLimiter } from "../../utils/rateLimit";

// The salon's wallet, payout accounts and withdrawals. Mounted at /merchant.
const router = Router();
// Money-moving and provider-calling actions; the preview runs as the amount is typed.
const moneyLimiter = createRateLimiter("merchant-wallet-money", 60_000, 10);
const previewLimiter = createRateLimiter("merchant-wallet-preview", 60_000, 60);
const connectLimiter = createRateLimiter("merchant-wallet-connect", 10 * 60_000, 20);

router.use(authenticateMerchant);

router.get("/wallet", wallet.summary);
router.get("/wallet/transactions", wallet.transactions);

router.get("/wallet/payout-methods", wallet.payoutMethods);
router.post("/wallet/payout-methods/bank", connectLimiter, wallet.addBank);
router.put("/wallet/payout-methods/:id/currency", wallet.payoutCurrency);
router.put("/wallet/payout-methods/:id/default", wallet.makeDefault);
router.delete("/wallet/payout-methods/:id", wallet.removePayoutMethod);
router.post("/wallet/stripe/onboarding-link", connectLimiter, wallet.stripeLink);
router.post("/wallet/stripe/sync", connectLimiter, wallet.stripeSync);
router.get("/wallet/airwallex/form", connectLimiter, wallet.airwallexSchema);
router.post("/wallet/airwallex/beneficiary", connectLimiter, wallet.airwallexConnect);

router.get("/wallet/withdrawals", wallet.withdrawals);
router.post("/wallet/withdrawals/preview", previewLimiter, wallet.preview);
router.post("/wallet/withdrawals", moneyLimiter, wallet.withdraw);
router.put("/wallet/withdrawals/:id/cancel", moneyLimiter, wallet.cancel);
router.put("/wallet/withdrawals/:id/claim", moneyLimiter, wallet.claim);
router.put("/wallet/withdrawals/:id/refresh", moneyLimiter, wallet.refresh);

export default router;
