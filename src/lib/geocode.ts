import { getServiceLogger } from "../utils/loggerCreator";

// An address to map coordinates, with OpenStreetMap's Nominatim (the same
// service the business-setup map uses). Their usage policy asks for an
// identifying User-Agent and light use, which occasional settings saves are.
// Null when nothing is found or the service doesn't answer.

const logger = getServiceLogger("geocode");

export async function geocodeAddress(address: string, countryCode?: string | null): Promise<{ latitude: number; longitude: number } | null> {
  const params = new URLSearchParams({ format: "json", limit: "1", q: address });
  if (countryCode) params.set("countrycodes", countryCode.toLowerCase());
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { "User-Agent": "KinkyHairStylists/1.0 (merchant settings)" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const [hit] = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!hit) return null;
    const latitude = Number(hit.lat);
    const longitude = Number(hit.lon);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
  } catch (err) {
    logger.warn("Geocoding failed", { error: (err as Error).message });
    return null;
  }
}
