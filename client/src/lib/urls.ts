export function buildPublicLinkUrl(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/drive/public/${token}`;
}
