import { getServiceLogger } from "../../utils/loggerCreator";
import { syncAirwallexTransfer } from "../merchant/wallet/withdrawalPayout";

const logger = getServiceLogger("airwallex-webhook");

// Transfer events for salon payouts. Shape (from the Airwallex dashboard's sample
// payloads): { id, name, account_id, data: { id, status, ... }, created_at }.
const TRANSFER_EVENTS = new Set(["payout.transfer.sent", "payout.transfer.paid", "payout.transfer.failed", "payout.transfer.cancelled"]);

export interface AirwallexEvent {
  id?: string;
  name?: string;
  data?: { id?: string };
}

/** The payout's status is read back from Airwallex, so only the transfer id is taken from the event. */
export async function handleAirwallexEvent(event: AirwallexEvent): Promise<void> {
  if (!event.name || !TRANSFER_EVENTS.has(event.name)) {
    logger.info("Unhandled Airwallex event", { name: event.name });
    return;
  }
  const transferId = event.data?.id;
  if (!transferId) return;
  const ours = await syncAirwallexTransfer(transferId);
  if (!ours) logger.info("Airwallex transfer isn't a submitted payout here", { transferId, name: event.name });
}
