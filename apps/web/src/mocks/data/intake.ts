import type { ICustomer, ITriageItem } from "@/types";
import { ETriageSource, ETriageStatus } from "@/types";
import { EStoryPriority } from "@/types/story/story";

/** Mock Customers (GIN-213). Priority weight lifts requests raised on their behalf. */
export const customers: ICustomer[] = [
  {
    id: "cust_acme_1",
    name: "Northwind Traders",
    email: "ops@northwind.example",
    priority_weight: 2, // strategic → floors priority at High
    notes: "Enterprise plan · 3-year contract",
    created_at: "2026-07-10T09:00:00Z",
  },
  {
    id: "cust_acme_2",
    name: "Contoso",
    email: "hello@contoso.example",
    priority_weight: 0,
    notes: null,
    created_at: "2026-07-12T09:00:00Z",
  },
];

function personaRoute(persona_id: string, persona_name: string, task_type: string) {
  return {
    domain: "general",
    task_type,
    persona_id,
    persona_name,
    skills: task_type === "bug" ? ["skill:testing-tdd"] : [],
    confidence: "medium" as const,
    rationale: `Classified as general / ${task_type}; routed to ${persona_name}.`,
    route: "persona" as const,
  };
}

/** Seed triage queue for the `acme` workspace — a mix of sources/states so the
 * card UI, the New→Triaged process step, dupe badges, and routing are all visible. */
export const triageItems: ITriageItem[] = [
  {
    id: "tri_1",
    workspace_slug: "acme",
    project_id: "prj_mba",
    source: ETriageSource.Customer,
    is_public: true,
    status: ETriageStatus.Triaged,
    title: "Payment fails on retry",
    body: "Customer reports a domestic transfer double-charges when the first attempt 5xx's and they retry.",
    customer_id: "cust_acme_1",
    classification: { domain: "general", task_type: "bug" },
    enriched_title: "Retry logic double-charges on transient 5xx",
    enriched_description:
      "<p>When a domestic transfer returns a 5xx and the user retries, the charge is applied twice.</p><p><strong>Acceptance</strong></p><ul><li>Retries are idempotent (idempotency key per transfer).</li><li>No duplicate ledger entry on double-submit.</li></ul>",
    priority: EStoryPriority.High,
    duplicate_ids: [
      { story_id: "st_mba_5", story_number: 5, title: "One-time domestic transfer" },
    ],
    recommended_route: personaRoute("agent_dev", "James (Developer)", "bug"),
    created_story_id: null,
    created_at: "2026-07-18T08:15:00Z",
    updated_at: "2026-07-18T08:16:00Z",
  },
  {
    id: "tri_2",
    workspace_slug: "acme",
    project_id: "prj_mba",
    source: ETriageSource.Personal,
    is_public: false,
    status: ETriageStatus.Triaged,
    title: "Add a dark mode toggle",
    body: "Users on the beta channel keep asking for a dark theme.",
    customer_id: null,
    classification: { domain: "general", task_type: "feature" },
    enriched_title: "Dark mode toggle in account settings",
    enriched_description:
      "<p>Add a light/dark theme toggle persisted per user.</p><p><strong>Acceptance</strong></p><ul><li>Toggle in Settings.</li><li>Preference persists across sessions.</li></ul>",
    priority: EStoryPriority.Medium,
    duplicate_ids: [],
    recommended_route: personaRoute("agent_ux", "Sally (UX)", "design"),
    created_story_id: null,
    created_at: "2026-07-18T07:40:00Z",
    updated_at: "2026-07-18T07:41:00Z",
  },
  {
    id: "tri_3",
    workspace_slug: "acme",
    project_id: null,
    source: ETriageSource.PublicForm,
    is_public: true,
    status: ETriageStatus.New,
    title: "Export statements as CSV",
    body: "From: reporter@northwind.example\n\nWould love to download my monthly statement as a CSV for accounting.",
    customer_id: null,
    classification: {},
    enriched_title: null,
    enriched_description: null,
    priority: null,
    duplicate_ids: [],
    recommended_route: {},
    created_story_id: null,
    created_at: "2026-07-18T06:05:00Z",
    updated_at: "2026-07-18T06:05:00Z",
  },
  {
    id: "tri_4",
    workspace_slug: "acme",
    project_id: "prj_mba",
    source: ETriageSource.InApp,
    is_public: true,
    status: ETriageStatus.Triaged,
    title: "Login button misaligned on iOS",
    body: "The primary button overlaps the keyboard on small iPhones.",
    customer_id: null,
    classification: { domain: "general", task_type: "bug" },
    enriched_title: "Login CTA overlaps keyboard on small iOS devices",
    enriched_description:
      "<p>On iPhone SE-class devices the login button is obscured by the on-screen keyboard.</p>",
    priority: EStoryPriority.Low,
    duplicate_ids: [],
    recommended_route: personaRoute("agent_dev", "James (Developer)", "bug"),
    created_story_id: null,
    created_at: "2026-07-17T15:20:00Z",
    updated_at: "2026-07-17T15:21:00Z",
  },
];
