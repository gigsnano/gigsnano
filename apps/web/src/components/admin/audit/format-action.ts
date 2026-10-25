export function formatAction(action: string): string {
  const [domain, verb] = action.split(".");
  const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  return verb ? `${cap(domain)} · ${verb}` : cap(domain);
}
