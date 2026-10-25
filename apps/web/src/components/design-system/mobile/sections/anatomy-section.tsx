import { DsSection } from "../ds-section";

const MAPPING = [
  { reminders: "Smart lists (Today, Scheduled, Flagged, All)", gigsnano: "Smart tiles: Due Today, Needs You, Overdue, Assigned", why: "One tap to the slices people check daily; the count is the headline." },
  { reminders: "My Lists (coloured circle + count)", gigsnano: "Projects, each with a tint", why: "Tint becomes the project's identity on rings, titles and chips." },
  { reminders: "List screen, title in list colour", gigsnano: "Project screen, sections by status", why: "You always know which project you're in without reading." },
  { reminders: "Completion circle", gigsnano: "Status ring (backlog → done)", why: "Same gesture to finish; the pie shows progress in between." },
  { reminders: "! / !! / !!! before the title", gigsnano: "Priority marks in the project tint", why: "Priority without a column or a badge." },
  { reminders: "Flag", gigsnano: "Needs You (approval, mention, blocker)", why: "Orange flag = someone is waiting on you." },
  { reminders: "Swipe: Details · Flag · Delete", gigsnano: "Swipe: Details · Flag · Delete", why: "Muscle memory transfers 1:1." },
  { reminders: "Details sheet (grouped rows, toggles)", gigsnano: "Item details sheet", why: "Edit in place, Cancel / Done, parent recedes behind." },
  { reminders: "⊕ New Reminder (bottom toolbar)", gigsnano: "⊕ New Item (bottom toolbar)", why: "Creation sits where the list is; replaces the centre ＋ tab." },
];

const PRINCIPLES = [
  { title: "Grouped, not bordered", body: "Content sits on rounded surfaces over a grey grouped background. No card borders, no 1px boxes." },
  { title: "Tint carries meaning", body: "One brand tint for actions. Each project picks a list colour that follows it everywhere." },
  { title: "System type, Dynamic Type", body: "SF Pro text styles with Apple's tracking table. Hierarchy from weight + size, never caps labels." },
  { title: "44pt and inset hairlines", body: "Every row is at least 44pt. Separators start at the text, never at the screen edge." },
  { title: "Feedback on touch-down", body: "Press scales to 0.97 instantly; haptics only on complete, select, swipe-commit and destructive." },
  { title: "Springs, interruptible", body: "Critically damped by default; bounce only after a flick. Swipes project momentum and rubber-band." },
];

/** Reminders → GigsNano: the pattern map and the six rules. */
export function AnatomySection() {
  return (
    <DsSection
      id="anatomy"
      eyebrow="Foundation"
      title="Why Reminders"
      description="Reminders is the closest native app to GigsNano mobile: lists of small actionable items, grouped by project, completed with one tap. We borrow its structure wholesale so the app feels familiar on first open."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PRINCIPLES.map((p) => (
          <div key={p.title} className="rounded-xl bg-muted/50 p-4">
            <p className="text-sm font-semibold text-foreground">{p.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Reminders</th>
              <th className="px-4 py-2.5 font-medium">GigsNano mobile</th>
              <th className="px-4 py-2.5 font-medium">Why</th>
            </tr>
          </thead>
          <tbody>
            {MAPPING.map((m) => (
              <tr key={m.reminders} className="border-t border-border">
                <td className="px-4 py-2.5 text-muted-foreground">{m.reminders}</td>
                <td className="px-4 py-2.5 font-medium text-foreground">{m.gigsnano}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{m.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DsSection>
  );
}
