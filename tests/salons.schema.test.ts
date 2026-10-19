import { describe, expect, it } from "vitest";
import { listSalonsSchema, salonsQuery } from "../src/schemas/customer/salons.schema";

const parse = (query: Record<string, unknown>) => listSalonsSchema.parse(salonsQuery(query));

describe("listSalonsSchema", () => {
  it("applies the old API's defaults", () => {
    expect(parse({})).toEqual({
      page: 1, limit: 10, search: "", location: "", minRating: 0, isLuxury: false, services: [], sortBy: "bestMatch",
      openWeekends: false, openEvenings: false, walkIns: false,
    });
  });

  it("reads the landing page's featured-salons query", () => {
    expect(parse({ limit: "50", isLuxury: "true", sortBy: "topRated", page: "1" })).toMatchObject({
      limit: 50, isLuxury: true, sortBy: "topRated", page: 1,
    });
  });

  it("accepts services as one value, repeated keys or axios's services[]", () => {
    expect(parse({ services: "braiding" }).services).toEqual(["braiding"]);
    expect(parse({ services: ["braiding", "manicure"] }).services).toEqual(["braiding", "manicure"]);
    expect(parse({ "services[]": ["braiding"] }).services).toEqual(["braiding"]);
  });

  it("drops service types that don't exist instead of failing", () => {
    expect(parse({ services: ["braiding", "'; DROP TABLE x"] }).services).toEqual(["braiding"]);
  });

  it("ignores unreadable values instead of failing", () => {
    expect(parse({ page: "-1", limit: "abc", sortBy: "nope", lat: "x", minRating: "9", date: "tomorrow", time: "25:00" })).toMatchObject({
      page: 1, limit: 10, sortBy: "bestMatch", lat: undefined, minRating: 0, date: undefined, time: undefined,
    });
  });

  it("caps the page size at 100", () => {
    expect(parse({ limit: "5000" }).limit).toBe(100);
  });

  it("keeps valid coordinates, dates and times", () => {
    expect(parse({ lat: "-33.86", lng: "151.2", date: "2026-07-14", time: "14:30" })).toMatchObject({
      lat: -33.86, lng: 151.2, date: "2026-07-14", time: "14:30",
    });
  });
});

describe("salon and review ids", () => {
  it("accept only uuids", async () => {
    const { salonIdSchema, reviewIdSchema } = await import("../src/schemas/customer/salons.schema");
    expect(salonIdSchema.safeParse({ id: "f58a4952-fdf8-4a80-8fdb-cd8131c63f2b" }).success).toBe(true);
    expect(salonIdSchema.safeParse({ id: "1 OR 1=1" }).success).toBe(false);
    expect(reviewIdSchema.safeParse({ reviewId: "abc" }).success).toBe(false);
  });
});
