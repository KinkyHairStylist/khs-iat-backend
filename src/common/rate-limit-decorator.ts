import { Throttle } from '@nestjs/throttler';

export function LoginRateLimit() {
  return Throttle({
    default: {
      limit: 5,
      ttl: 60_000,
    },
  });
}

export function RegisterRateLimit() {
  return Throttle({
    default: {
      limit: 3,
      ttl: 60_000,
    },
  });
}

export function RefreshRateLimit() {
  return Throttle({
    default: {
      limit: 20,
      ttl: 60_000,
    },
  });
}

export function PasswordRateLimit() {
  return Throttle({
    default: {
      limit: 3,
      ttl: 30_000,
    },
  });
}

export function OtpRateLimit() {
  return Throttle({
    default: {
      limit: 3,
      ttl: 60_000,
    },
  });
}

export function PhoneRateLimit() {
  return Throttle({
    default: {
      limit: 3,
      ttl: 60_000,
    },
  });
}

export function InitRateLimit() {
  return Throttle({
    default: {
      limit: 5,
      ttl: 60_000,
    },
  });
}

export function VerifyRateLimit() {
  return Throttle({
    default: {
      limit: 5,
      ttl: 30_000,
    },
  });
}
