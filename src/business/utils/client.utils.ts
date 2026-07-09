export function formatClientType(clientType: string): string {
  if (!clientType) return '';

  if (clientType.toLowerCase() === 'vip') {
    return 'VIP';
  }

  // Capitalize first letter, lowercase the rest
  return clientType.charAt(0).toUpperCase() + clientType.slice(1).toLowerCase();
}

export function capitalizeString(text: string): string {
  if (!text) return '';

  return text
    .split(' ')
    .filter(Boolean)
    .map((word) =>
      word.toLowerCase() === 'ksh'
        ? 'KSH'
        : word
            .split('-')
            .map(
              (sub) => sub.charAt(0).toUpperCase() + sub.slice(1).toLowerCase(),
            )
            .join('-'),
    )
    .join(' ');
}
