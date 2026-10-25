/** Client-side mirror of backend render_template for admin preview. */

const PLACEHOLDER_RE = /\{(\w+)\}/g;

export function renderPreview(
  titleTpl: string,
  bodyTpl: string,
  context: Record<string, string>,
): { title: string; body: string } {
  const replace = (text: string) =>
    text.replace(PLACEHOLDER_RE, (_, key: string) => context[key] ?? "");
  return { title: replace(titleTpl), body: replace(bodyTpl) };
}
