/** Where a tapped push notification opens: its own in-app route, else the inbox. */
export function notificationRoute(data: Record<string, unknown> | null | undefined): string {
  const route = data?.route;
  if (typeof route === "string" && route.startsWith("/") && !route.startsWith("//")) return route;
  return "/inbox";
}
