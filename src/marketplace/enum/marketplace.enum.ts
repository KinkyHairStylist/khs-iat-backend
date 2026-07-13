export enum ProductCategory {
  BROW = 'brow',
  LASH = 'lash',
  TOOLS_EQUIPMENT = 'tools_equipment',
  HAIR_CARE = 'hair_care',
  STYLING_PRODUCTS = 'styling_products',
  COLOR_TREATMENT = 'color_treatment',
  NAIL_CARE = 'nail_care',
  SKIN_CARE = 'skin_care',
}

export enum ShippingStatus {
  NOT_SHIPPED = 'not_shipped',
  PROCESSING = 'processing',
  SHIPPED = 'shipped',
  IN_TRANSIT = 'in_transit',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
}

export const DEFAULTPRODUCTCATEGORIES = [
  'brow',
  'lash',
  'tools_equipment',
  'hair_care',
  'styling_products',
  'color_treatment',
  'nail_care',
  'skin_care',
  'other',
];
