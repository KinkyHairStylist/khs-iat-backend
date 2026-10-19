import { describe, expect, it } from "vitest";
import { listSalonsSchema } from "../src/schemas/customer/salons.schema";

describe("salon availability filters", () => {
  it("reads the four availability options", () => {
    expect(listSalonsSchema.parse({ openAt: "2026-07-14T14:30", openWeekends: "true", openEvenings: "true", walkIns: "true" })).toMatchObject({
      openAt: "2026-07-14T14:30",
      openWeekends: true,
      openEvenings: true,
      walkIns: true,
    });
  });

  it("defaults them off and ignores a malformed time", () => {
    expect(listSalonsSchema.parse({ openAt: "now" })).toMatchObject({ openAt: undefined, openWeekends: false, openEvenings: false, walkIns: false });
    expect(listSalonsSchema.parse({ openAt: "2026-07-14T25:00" }).openAt).toBeUndefined();
  });
});
