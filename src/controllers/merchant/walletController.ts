import { idParamSchema } from "../../schemas/fields";
import {
  airwallexBeneficiarySchema, bankAccountSchema, payoutCurrencySchema, walletSummaryQuerySchema, walletTransactionQuerySchema, withdrawalSchema,
} from "../../schemas/merchant/wallet.schema";
import { parseSchema } from "../../utils/parseSchema";
import { airwallexForm, connectAirwallex, stripeOnboardingLink, syncStripeAccount } from "../../services/merchant/wallet/payoutConnect";
import { addBankAccount, listPayoutMethods, removeMethod, setDefaultMethod, setPayoutCurrency } from "../../services/merchant/wallet/payoutMethods";
import { walletSummary } from "../../services/merchant/wallet/walletAccount";
import { listTransactions } from "../../services/merchant/wallet/walletTransactions";
import { claimWithdrawal, refreshPayoutStatus } from "../../services/merchant/wallet/withdrawalPayout";
import { cancelWithdrawal, listWithdrawals, previewWithdrawal, requestWithdrawal } from "../../services/merchant/wallet/withdrawals";
import { merchantHandler } from "./merchantHandler";

const id = (params: unknown) => parseSchema(idParamSchema, params).id;

export const summary = merchantHandler(async (req, res, userId) => {
  res.success(await walletSummary(userId, parseSchema(walletSummaryQuerySchema, req.query)));
});

export const transactions = merchantHandler(async (req, res, userId) => {
  res.success(await listTransactions(userId, parseSchema(walletTransactionQuerySchema, req.query)));
});

export const payoutMethods = merchantHandler(async (_req, res, userId) => {
  res.success(await listPayoutMethods(userId));
});

export const addBank = merchantHandler(async (req, res, userId) => {
  res.success(await addBankAccount(userId, parseSchema(bankAccountSchema, req.body)), "Bank account saved", 201);
});

export const payoutCurrency = merchantHandler(async (req, res, userId) => {
  res.success(await setPayoutCurrency(userId, id(req.params), parseSchema(payoutCurrencySchema, req.body).payoutCurrency), "Payout currency saved");
});

export const makeDefault = merchantHandler(async (req, res, userId) => {
  await setDefaultMethod(userId, id(req.params));
  res.success(null, "Default payout account changed");
});

export const removePayoutMethod = merchantHandler(async (req, res, userId) => {
  await removeMethod(userId, id(req.params));
  res.success(null, "Payout account removed");
});

export const stripeLink = merchantHandler(async (_req, res, userId) => {
  res.success(await stripeOnboardingLink(userId));
});

export const stripeSync = merchantHandler(async (_req, res, userId) => {
  res.success(await syncStripeAccount(userId));
});

export const airwallexSchema = merchantHandler(async (_req, res, userId) => {
  res.success(await airwallexForm(userId));
});

export const airwallexConnect = merchantHandler(async (req, res, userId) => {
  res.success(await connectAirwallex(userId, parseSchema(airwallexBeneficiarySchema, req.body).answers), "Airwallex account connected", 201);
});

export const withdrawals = merchantHandler(async (_req, res, userId) => {
  res.success(await listWithdrawals(userId));
});

export const preview = merchantHandler(async (req, res, userId) => {
  res.success(await previewWithdrawal(userId, parseSchema(withdrawalSchema, req.body)));
});

export const withdraw = merchantHandler(async (req, res, userId) => {
  res.success(await requestWithdrawal(userId, parseSchema(withdrawalSchema, req.body)), "Withdrawal requested", 201);
});

export const cancel = merchantHandler(async (req, res, userId) => {
  res.success(await cancelWithdrawal(userId, id(req.params)), "Withdrawal request cancelled");
});

export const claim = merchantHandler(async (req, res, userId) => {
  res.success(await claimWithdrawal(userId, id(req.params)), "Payout sent");
});

export const refresh = merchantHandler(async (req, res, userId) => {
  res.success(await refreshPayoutStatus(userId, id(req.params)));
});
