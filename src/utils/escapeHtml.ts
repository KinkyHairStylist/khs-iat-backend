const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Escapes user-supplied text (names, addresses, chat messages) before it goes
 * into an email's HTML, so nobody can inject markup or links into an email
 * that's sent from Kinky Hair Stylist's domain.
 */
export function escapeHtml(value: string | null | undefined): string {
  return (value ?? "").replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}
