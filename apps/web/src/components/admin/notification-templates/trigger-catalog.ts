import type { INotificationTemplate } from "@/types";

/** Sample context for live preview — mirrors backend seed labels. */
const TRIGGER_CATALOG: Record<
  string,
  { sampleContext: Record<string, string> }
> = {
  "story.assigned": {
    sampleContext: { actor: "Ada Lovelace", project: "Mobile App", story: "Implement login" },
  },
  "sprint.zero_complete": { sampleContext: { project: "Mobile App" } },
  "story.created.assigned": {
    sampleContext: { actor: "Ada Lovelace", project: "Mobile App", story: "New task" },
  },
  "story.comment": { sampleContext: { actor: "Ada Lovelace", story: "Implement login" } },
  "story.completed": { sampleContext: { actor: "Ada Lovelace", story: "Implement login" } },
  "mention.story": { sampleContext: { actor: "Ada Lovelace", story: "Implement login" } },
  "workspace.invite_pending": {
    sampleContext: { actor: "Ada Lovelace", workspace: "Acme" },
  },
  "project.member_added": { sampleContext: { actor: "Ada Lovelace", project: "Mobile App" } },
  "sprint.plan_ready": { sampleContext: { project: "Mobile App" } },
  "readiness.concerns": { sampleContext: { project: "Mobile App" } },
  "readiness.fail": { sampleContext: { project: "Mobile App" } },
  "document.comment.assigned": {
    sampleContext: { actor: "Ada Lovelace", document: "PRD — Mobile App" },
  },
  "mention.document": {
    sampleContext: { actor: "Ada Lovelace", document: "PRD — Mobile App" },
  },
  "export.ready": { sampleContext: {} },
  "github.docs_synced": { sampleContext: { project: "Mobile App" } },
  "marketplace.bid_received": {
    sampleContext: { bidder: "Sam Freelancer", listing: "Sprint-0 UX card", amount: "$500.00" },
  },
  "marketplace.bid_accepted": { sampleContext: { listing: "Sprint-0 UX card" } },
  "marketplace.bid_declined": { sampleContext: { listing: "Sprint-0 UX card" } },
  "marketplace.delivered": {
    sampleContext: { freelancer: "Sam Freelancer", listing: "Sprint-0 UX card" },
  },
  "marketplace.changes_requested": { sampleContext: { listing: "Sprint-0 UX card" } },
  "marketplace.payout": {
    sampleContext: { listing: "Sprint-0 UX card", amount: "$500.00" },
  },
  "marketplace.cancelled": { sampleContext: { listing: "Sprint-0 UX card" } },
  "billing.topup_receipt": {
    sampleContext: { workspace: "Acme", amount: "$100.00" },
  },
};

export function sampleContextFor(template: INotificationTemplate): Record<string, string> {
  return TRIGGER_CATALOG[template.trigger_key]?.sampleContext ?? {};
}
