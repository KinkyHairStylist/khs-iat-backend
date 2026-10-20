import type { client_addresses, client_settings, clients, emergency_contacts_schema } from "../../../generated/prisma/client";
import type { clients_clientsource_enum, clients_pronouns_enum } from "../../../generated/prisma/enums";
import type { ClientInput } from "../../../schemas/merchant/clients.schema";

// A client record as the profile form edits it, and back. Prisma's enum
// names use "_" where the stored values use "-" ("walk_in" ↔ "walk-in").

const dash = (v: string | null) => (v ? v.replace(/_/g, "-") : null);
const underscore = <T extends string>(v: string) => v.replace(/-/g, "_") as T;

// The old app saved an empty first address and contact for every client, with
// "No Name" / "None" filled in; those aren't shown.
const PLACEHOLDER = new Set(["", "none", "no name", "n/a"]);
const isReal = (v: string | null | undefined) => !!v && !PLACEHOLDER.has(v.trim().toLowerCase());

/** "2026-09-11T00:00:00.000+00:00" or "2026-09-11" → "2026-09-11". */
const dayOf = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

interface Preferences { preferredContactMethod?: string; language?: string; timezone?: string }

export function fromDb(c: clients, addresses: client_addresses[], contacts: emergency_contacts_schema[], settings: client_settings | null) {
  const prefs = (settings?.preferences ?? {}) as Preferences;
  return {
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    name: `${c.firstName} ${c.lastName}`.trim(),
    email: c.email,
    // Older walk-in clients have the whole number in phone and no code.
    phone: c.phone,
    phoneCode: c.phoneCode || "",
    dateOfBirth: dayOf(c.dateOfBirth),
    gender: c.gender,
    pronouns: dash(c.pronouns),
    occupation: c.occupation,
    clientSource: dash(c.clientSource),
    profileImage: c.profileImage,
    createdAt: c.createdAt,
    addresses: addresses
      .filter((a) => isReal(a.addressName) || isReal(a.location))
      .map((a) => ({ addressName: a.addressName ?? a.addressLine1 ?? "", addressLine2: a.addressLine2, location: a.location ?? "", city: a.city, state: a.state, zipCode: a.zipCode, country: a.country || null, isPrimary: a.isPrimary })),
    emergencyContacts: contacts
      .filter((e) => isReal(e.firstName))
      .map((e) => ({ firstName: e.firstName ?? "", lastName: isReal(e.lastName) ? e.lastName : null, email: e.email ?? "", relationship: isReal(e.relationship) ? e.relationship : "", phone: isReal(e.phone) ? e.phone : "", phoneCode: isReal(e.emergencyPhoneCode) ? e.emergencyPhoneCode : "" })),
    settings: {
      emailNotifications: settings?.emailNotifications ?? true,
      smsNotifications: settings?.smsNotifications ?? true,
      marketingEmails: settings?.marketingEmails ?? false,
      notes: settings?.notes ?? "",
      preferredContactMethod: prefs.preferredContactMethod || null,
      language: prefs.language || null,
      timezone: prefs.timezone || null,
    },
  };
}

export function profileData(input: ClientInput) {
  return {
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
    phoneCode: input.phoneCode,
    dateOfBirth: input.dateOfBirth ?? null,
    gender: input.gender,
    pronouns: underscore<clients_pronouns_enum>(input.pronouns),
    occupation: input.occupation,
    clientSource: underscore<clients_clientsource_enum>(input.clientSource),
    profileImage: input.profileImage ?? null,
  };
}

export const addressRows = (clientId: string, input: ClientInput) =>
  input.addresses.map((a, i) => ({
    client_id: clientId, addressName: a.addressName, addressLine1: a.addressName, addressLine2: a.addressLine2, location: a.location,
    city: a.city, state: a.state ?? "", zipCode: a.zipCode ?? "", country: a.country ?? "", isPrimary: i === 0,
  }));

export const contactRows = (clientId: string, input: ClientInput) =>
  input.emergencyContacts.map((e) => ({
    client_id: clientId, firstName: e.firstName, lastName: e.lastName, email: e.email, relationship: e.relationship, phone: e.phone, emergencyPhoneCode: e.phoneCode,
  }));

export const settingsData = (input: ClientInput) => ({
  emailNotifications: input.settings.emailNotifications,
  smsNotifications: input.settings.smsNotifications,
  marketingEmails: input.settings.marketingEmails,
  notes: input.settings.notes,
  preferences: { preferredContactMethod: input.settings.preferredContactMethod ?? "", language: input.settings.language ?? "", timezone: input.settings.timezone ?? "" },
});
