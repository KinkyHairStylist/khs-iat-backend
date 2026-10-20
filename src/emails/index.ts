export { renderEmailLayout, renderButton } from "./layout";
export { verificationCodeEmail } from "./verificationCodeEmail";
export type { CodePurpose } from "./verificationCodeEmail";
export {
  welcomeEmail,
  loginAlertEmail,
  passwordChangedEmail,
  newCustomerTeamEmail,
  referralRewardEmail,
  addressChangedEmail,
  accountDeletedEmail,
  refundRequestedEmail,
  refundRequestTeamEmail,
} from "./accountEmails";
export type { RenderedEmail } from "./types";
export { bookingConfirmedEmail, merchantNewBookingEmail } from "./bookingEmails";
export type { BookingEmailDetails } from "./bookingEmails";
export { membershipPurchasedEmail, giftCardPurchasedEmail, giftCardReceivedEmail, merchantGiftCardSoldEmail } from "./purchaseEmails";
export { bookingCancelledEmail, bookingRescheduledEmail, merchantBookingCancelledEmail, merchantAvailabilityConfirmedEmail } from "./bookingChangeEmails";
export { merchantWelcomeEmail, merchantUnderReviewEmail } from "./merchantAccountEmails";
export { bookingAcceptedBySalonEmail, bookingCancelledBySalonEmail, bookingCompletedEmail, bookingNoShowEmail } from "./salonBookingEmails";
export { staffAddedEmail, staffRemovedEmail } from "./staffEmails";
