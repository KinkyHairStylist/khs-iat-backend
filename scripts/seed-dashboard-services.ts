import 'dotenv/config';
import { AppDataSource } from '../src/config/database';
import { Business } from '../src/business/entities/business.entity';
import { Service } from '../src/business/entities/service.entity';
import { BusinessCategory } from '../src/business/types/category.enum';
import { ServiceType } from '../src/business/types/service-type.enum';
import { PriceType } from '../src/business/types/price-type.enum';

// Seeds Service rows for one specific merchant's business, so the merchant
// dashboard (Services, and later Staff/Bookings which depend on these) has
// real data to render. Idempotent: re-running skips services that already
// exist by name for this business, so it's safe to run again after adding
// more entries below.
const MERCHANT_EMAIL = 'proiquovizoiho-6823@yopmail.com';

const SERVICES: Array<{
  name: string;
  category: BusinessCategory;
  serviceType: ServiceType;
  description: string;
  priceType: PriceType;
  price?: number;
  minPrice?: number;
  maxPrice?: number;
  duration: string;
  images: string[];
}> = [
  {
    name: 'Signature Silk Press',
    category: BusinessCategory.HAIR_SERVICES,
    serviceType: ServiceType.BLOW_DRY,
    description: 'Smooth, sleek blowout finished with a flat-iron press for lasting shine.',
    priceType: PriceType.FIXED,
    price: 18000,
    duration: '75 min',
    images: ['https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800'],
  },
  {
    name: 'Knotless Box Braids',
    category: BusinessCategory.HAIR_SERVICES,
    serviceType: ServiceType.BRAIDING,
    description: 'Lightweight knotless braids, medium size, shoulder length or longer.',
    priceType: PriceType.VARIABLE,
    minPrice: 30000,
    maxPrice: 45000,
    duration: '240 min',
    images: [],
  },
  {
    name: 'Balayage Color Melt',
    category: BusinessCategory.HAIR_SERVICES,
    serviceType: ServiceType.HAIR_COLORING,
    description: 'Hand-painted highlights with a seamless color transition.',
    priceType: PriceType.VARIABLE,
    minPrice: 28000,
    maxPrice: 40000,
    duration: '150 min',
    images: [],
  },
  {
    name: 'Deep Moisture Treatment',
    category: BusinessCategory.HAIR_SERVICES,
    serviceType: ServiceType.HAIR_TREATMENT,
    description: 'Steam-assisted deep conditioning for dry or damaged hair.',
    priceType: PriceType.FIXED,
    price: 12000,
    duration: '45 min',
    images: [],
  },
  {
    name: 'Classic Gel Manicure',
    category: BusinessCategory.NAIL_SERVICES,
    serviceType: ServiceType.GEL_POLISH,
    description: 'Shape, cuticle care, and long-lasting gel polish.',
    priceType: PriceType.FIXED,
    price: 9000,
    duration: '45 min',
    images: [],
  },
  {
    name: 'Acrylic Full Set',
    category: BusinessCategory.NAIL_SERVICES,
    serviceType: ServiceType.ACRYLIC_NAILS,
    description: 'Full acrylic overlay with shape and polish of your choice.',
    priceType: PriceType.VARIABLE,
    minPrice: 15000,
    maxPrice: 22000,
    duration: '90 min',
    images: [],
  },
  {
    name: 'Bridal Glam Makeup',
    category: BusinessCategory.MAKEUP_SERVICES,
    serviceType: ServiceType.BRIDAL_MAKEUP,
    description: 'Full bridal face including lashes, trial run included.',
    priceType: PriceType.FIXED,
    price: 55000,
    duration: '120 min',
    images: [],
  },
  {
    name: 'Everyday Natural Glam',
    category: BusinessCategory.MAKEUP_SERVICES,
    serviceType: ServiceType.NATURAL_GLAM,
    description: 'Soft, everyday makeup look for photos or events.',
    priceType: PriceType.FIXED,
    price: 15000,
    duration: '45 min',
    images: [],
  },
  {
    name: 'Hydrating Facial',
    category: BusinessCategory.SKINCARE,
    serviceType: ServiceType.DEEP_CLEANSING_FACIAL,
    description: 'Deep cleanse, exfoliation, and hydration mask.',
    priceType: PriceType.FIXED,
    price: 20000,
    duration: '60 min',
    images: [],
  },
  {
    name: 'Classic Lash Extensions',
    category: BusinessCategory.LASHES_BROWS,
    serviceType: ServiceType.LASH_EXTENSION,
    description: 'Classic 1:1 lash extensions for a natural, fuller look.',
    priceType: PriceType.FIXED,
    price: 17000,
    duration: '90 min',
    images: [],
  },
];

async function main() {
  await AppDataSource.initialize();
  console.log('DB connected\n');

  const businessRepo = AppDataSource.getRepository(Business);
  const serviceRepo = AppDataSource.getRepository(Service);

  const business = await businessRepo.findOne({
    where: { ownerEmail: MERCHANT_EMAIL },
  });

  if (!business) {
    throw new Error(`No business found with ownerEmail=${MERCHANT_EMAIL}`);
  }
  console.log(`Seeding services for business "${business.businessName}" (${business.id})\n`);

  let created = 0;
  let skipped = 0;

  for (const def of SERVICES) {
    const existing = await serviceRepo.findOne({
      where: { name: def.name, business: { id: business.id } },
      relations: ['business'],
    });

    if (existing) {
      console.log(`SKIP  (already exists): ${def.name}`);
      skipped++;
      continue;
    }

    const service = serviceRepo.create({
      ...def,
      business,
    });
    await serviceRepo.save(service);
    console.log(`CREATE: ${def.name}`);
    created++;
  }

  console.log(`\nDone. Created ${created}, skipped ${skipped} (already existed).`);

  await AppDataSource.destroy();
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
