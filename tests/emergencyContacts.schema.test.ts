import { describe, expect, it } from "vitest";
import { clientSchema } from "../src/schemas/merchant/clients.schema";
import { staffSchema } from "../src/schemas/merchant/staff.schema";

// An emergency contact's optional fields can be left empty: the forms have sent null for a cleared field,
// which used to fail with "Emergency contacts last name is required." (KHS.M.PAR.05.02.UA01).

const client = (lastName: unknown) => ({
  firstName: "Ada",
  lastName: "Client",
  email: "ada.client@example.com",
  phone: "0412345678",
  phoneCode: "+61",
  gender: "FEMALE",
  pronouns: "she-her",
  emergencyContacts: [{ firstName: "Bo", lastName, email: "bo@example.com", relationship: "Sister", phone: "0412345679", phoneCode: "+61" }],
});

const staff = (relationship: unknown) => ({
  firstName: "Cy",
  lastName: "Stylist",
  email: "cy.stylist@example.com",
  gender: "MALE",
  phoneNumber: "+61 412345678",
  emergencyContacts: [{ firstName: "Di", relationship, email: "di@example.com", phoneNumber: "+61 412345670" }],
});

describe("emergency contacts: optional fields left empty", () => {
  for (const [label, value] of [["null", null], ["missing", undefined], ["empty", ""], ["spaces", "   "]] as const) {
    it(`a client's contact saves with the last name ${label}`, () => {
      const parsed = clientSchema.safeParse(client(value));
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
      expect(parsed.data?.emergencyContacts[0].lastName).toBeNull();
    });

    it(`a staff member's contact saves with the relationship ${label}`, () => {
      const parsed = staffSchema.safeParse(staff(value));
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
      expect(parsed.data?.emergencyContacts[0].relationship).toBeNull();
    });
  }

  it("keeps a last name that is given", () => {
    expect(clientSchema.parse(client("  Lee ")).emergencyContacts[0].lastName).toBe("Lee");
  });
});
