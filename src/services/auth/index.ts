// Customer and merchant authentication, one file per job:
//   accountAccess        who may use each side; the profile an account sees
//   sessionService       login, refresh, logout, me
//   signupService        email → code → details
//   passwordResetService email → code → new password
export { customerAccessError, merchantAccessError, SITE_ACCESS, type CustomerProfile } from "./accountAccess";
export { login, refreshSession, logoutByRefreshToken, getProfile, openSession, type SessionResult } from "./sessionService";
export { startSignup, verifySignupCode, completeSignup } from "./signupService";
export { startPasswordReset, verifyPasswordResetCode, finishPasswordReset } from "./passwordResetService";
