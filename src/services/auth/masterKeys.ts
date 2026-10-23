import bcrypt from "bcryptjs";
import prisma from "../../lib/prisma/prisma";

// The support master keys set in the staff app (Platform Settings → Master
// Keys; khs-iat-staff-be masterKeysService). Any one of them signs in to any
// customer or merchant account, never a staff account. Only bcrypt hashes are
// stored, in platform_settings.general.masterKeys.

const SLOTS = ["1", "2", "3"] as const;
// Compared when a slot is empty, so a check takes the same time however many keys are set.
const FILLER = bcrypt.hashSync("unset-master-key-slot", 10);

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** The number (1–3) of the master key this matches, or null. */
export async function matchMasterKey(candidate: string): Promise<number | null> {
  if (!candidate) return null;
  const row = await prisma.platform_settings.findFirst({ select: { general: true } });
  const general = isObject(row?.general) ? row.general : {};
  const keys = isObject(general.masterKeys) ? general.masterKeys : {};
  let matched: number | null = null;
  // Every slot is checked, even after a match, so timing doesn't tell which slot (or whether any) is set.
  for (const slot of SLOTS) {
    const entry = keys[slot];
    const hash = isObject(entry) && typeof entry.hash === "string" ? entry.hash : null;
    const ok = await bcrypt.compare(candidate, hash ?? FILLER);
    if (ok && hash && matched === null) matched = Number(slot);
  }
  return matched;
}
