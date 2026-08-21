export function isRedisUsable(client: any) {
  return client && client.status === "ready";
}