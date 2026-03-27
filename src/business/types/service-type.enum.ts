export enum ServiceType {
  // Hair Services
  WOMEN_HAIRCUT = 'women-haircut',
  MEN_HAIRCUT = 'men-haircut',
  HAIR_COLORING = 'hair-coloring',
  HAIR_TREATMENT = 'hair-treatment',
  BLOW_DRY = 'blow-dry',
  BRAIDING = 'braiding',

  // Nail Services
  MANICURE = 'manicure',
  PEDICURE = 'pedicure',
  GEL_POLISH = 'gel-polish',
  ACRYLIC_NAILS = 'acrylic-nails',

  // Makeup Services
  BRIDAL_MAKEUP = 'bridal-makeup',
  PARTY_MAKEUP = 'party-makeup',
  NATURAL_GLAM = 'natural-glam',

  // Spa Treatments
  FACIAL = 'facial',
  BODY_SCRUB = 'body-scrub',
  MASSAGE = 'massage',

  // Barbering
  BEARD_TRIM = 'beard-trim',
  FADE_CUT = 'fade-cut',

  // Skincare
  DEEP_CLEANSING_FACIAL = 'deep-cleansing-facial',
  ACNE_TREATMENT = 'acne-treatment',

  // Lashes & Brows
  LASH_EXTENSION = 'lash-extension',
  BROW_SHAPING = 'brow-shaping',
  BROW_TINT = 'brow-tint',

  // Body Care
  WAXING = 'waxing',
  BODY_POLISH = 'body-polish',
}

export const SERVICE_TYPES = [
  // Hair Services
  { value: ServiceType.WOMEN_HAIRCUT, label: 'Women Haircut' },
  { value: ServiceType.MEN_HAIRCUT, label: 'Men Haircut' },
  { value: ServiceType.HAIR_COLORING, label: 'Hair Coloring' },
  { value: ServiceType.HAIR_TREATMENT, label: 'Hair Treatment' },
  { value: ServiceType.BLOW_DRY, label: 'Blow Dry' },
  { value: ServiceType.BRAIDING, label: 'Braiding' },

  // Nail Services
  { value: ServiceType.MANICURE, label: 'Manicure' },
  { value: ServiceType.PEDICURE, label: 'Pedicure' },
  { value: ServiceType.GEL_POLISH, label: 'Gel Polish' },
  { value: ServiceType.ACRYLIC_NAILS, label: 'Acrylic Nails' },

  // Makeup Services
  { value: ServiceType.BRIDAL_MAKEUP, label: 'Bridal Makeup' },
  { value: ServiceType.PARTY_MAKEUP, label: 'Party Makeup' },
  { value: ServiceType.NATURAL_GLAM, label: 'Natural Glam' },

  // Spa Treatments
  { value: ServiceType.FACIAL, label: 'Facial' },
  { value: ServiceType.BODY_SCRUB, label: 'Body Scrub' },
  { value: ServiceType.MASSAGE, label: 'Massage' },

  // Barbering
  { value: ServiceType.MEN_HAIRCUT, label: 'Men Haircut' },
  { value: ServiceType.BEARD_TRIM, label: 'Beard Trim' },
  { value: ServiceType.FADE_CUT, label: 'Fade Cut' },

  // Skincare
  { value: ServiceType.DEEP_CLEANSING_FACIAL, label: 'Deep Cleansing Facial' },
  { value: ServiceType.ACNE_TREATMENT, label: 'Acne Treatment' },

  // Lashes & Brows
  { value: ServiceType.LASH_EXTENSION, label: 'Lash Extension' },
  { value: ServiceType.BROW_SHAPING, label: 'Brow Shaping' },
  { value: ServiceType.BROW_TINT, label: 'Brow Tint' },

  // Body Care
  { value: ServiceType.WAXING, label: 'Waxing' },
  { value: ServiceType.BODY_POLISH, label: 'Body Polish' },
];