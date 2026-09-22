// A salon's own targets and takings are for its owner, not for the customers browsing the public salon pages.
const PRIVATE_BUSINESS_FIELDS = ['revenueGoal', 'revenue'] as const;

export function toPublicBusiness<T extends object>(business: T): T {
  const copy: Record<string, unknown> = { ...(business as Record<string, unknown>) };
  for (const field of PRIVATE_BUSINESS_FIELDS) delete copy[field];
  if (Array.isArray(copy.serviceList)) copy.serviceList = copy.serviceList.map(toPublicService);
  return copy as T;
}

// A service loaded with its salon attached carries that salon's private fields along.
export function toPublicService<T extends object>(service: T): T {
  const copy: Record<string, unknown> = { ...(service as Record<string, unknown>) };
  if (copy.business && typeof copy.business === 'object') copy.business = toPublicBusiness(copy.business);
  return copy as T;
}
