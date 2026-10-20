// Thrown when a salon's saved credentials stop working (token revoked, key
// deleted). The sync forgets them and tells the salon to reconnect, instead of
// every later booking failing quietly.
export class IntegrationAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntegrationAuthError";
  }
}

/** A provider call that failed for another reason (logged; the booking is never affected). */
export class IntegrationCallError extends Error {
  constructor(provider: string, action: string, readonly status: number, detail: string) {
    super(`${provider} ${action} failed (${status}): ${detail}`);
    this.name = "IntegrationCallError";
  }
}
