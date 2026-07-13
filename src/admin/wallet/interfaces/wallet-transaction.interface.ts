export interface WalletTransaction {
  id: string;
  user: string;
  type: "Earning" | "Fee" | "Withdrawal" | "Refund";
  amount: number;
  description: string;
  status: "Pending" | "Processing" | "Completed" | "Failed";
  balance: number;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM AM/PM
}
