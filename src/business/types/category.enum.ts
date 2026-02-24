export enum BusinessCategory {
  HAIR_SERVICES = 'hair-services',
  NAIL_SERVICES = 'nail-services',
  MAKEUP_SERVICES = 'makeup-services',
  SPA_TREATMENTS = 'spa-treatments',
  BARBERING = 'barbering',
  SKINCARE = 'skincare',
  LASHES_BROWS = 'lashes-brows',
  BODY_CARE = 'body-care',
}

export const BUSINESS_CATEGORIES = [
  { value: BusinessCategory.HAIR_SERVICES, label: 'Hair Services' },
  { value: BusinessCategory.NAIL_SERVICES, label: 'Nail Services' },
  { value: BusinessCategory.MAKEUP_SERVICES, label: 'Makeup Services' },
  { value: BusinessCategory.SPA_TREATMENTS, label: 'Spa & Treatments' },
  { value: BusinessCategory.BARBERING, label: 'Barbering' },
  { value: BusinessCategory.SKINCARE, label: 'Skincare' },
  { value: BusinessCategory.LASHES_BROWS, label: 'Lashes & Brows' },
  { value: BusinessCategory.BODY_CARE, label: 'Body Care' },
];