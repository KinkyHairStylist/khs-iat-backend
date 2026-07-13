export enum CompanySize {
  SOLO = 'solo',
  SMALL_TEAM = 'small-team',
  MULTI_STAFF = 'multi-staff',
}

export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  CUSTOM = 'CUSTOM',
  PREFER_NOT_TO_SAY = 'PREFER_NOT_TO_SAY',
}

export enum ApplicationStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export interface Payload {
  sub: string;
  email: string;
}

export interface BusinessServiceData {
  title: string;
  description: string;
}

export interface BookingPoliciesData {
  title: string;
  duration: string[];
}
