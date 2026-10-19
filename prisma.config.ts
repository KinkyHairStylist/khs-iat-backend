import "dotenv/config";
import { defineConfig } from "prisma/config";

// The database is shared with the Kinky-Hair-Stylist (NestJS) backend, which
// owns the schema. prisma/schema.prisma is introspected from it with
// `npm run prisma:pull` — never run `prisma migrate` or `prisma db push` here.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
