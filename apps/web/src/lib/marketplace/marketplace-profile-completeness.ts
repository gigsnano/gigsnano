import { EMarketplaceRole } from "@/types";

/** The store fields completeness cares about (shape-compatible with the profile store). */
export interface IProfileFields {
  role: EMarketplaceRole | null;
  display_name: string;
  title: string;
  hourly_rate: number | null;
  skills: string[];
  overview: string;
  company_name: string;
  industry: string;
  company_size: string;
}

export interface IChecklistRow {
  key: string;
  label: string;
  hint: string;
  weight: number;
  done: boolean;
}

/** Role-specific profile checklist ("Complete your profile" rows). */
export function profileChecklist(p: IProfileFields): IChecklistRow[] {
  if (p.role === EMarketplaceRole.Client) {
    return [
      { key: "name", label: "Display name", hint: "How freelancers see you", weight: 25, done: Boolean(p.display_name.trim()) },
      { key: "company", label: "Company name", hint: "Who's hiring", weight: 25, done: Boolean(p.company_name.trim()) },
      { key: "industry", label: "Industry", hint: "Your line of business", weight: 25, done: Boolean(p.industry) },
      { key: "size", label: "Company size", hint: "Team headcount", weight: 25, done: Boolean(p.company_size) },
    ];
  }
  return [
    { key: "name", label: "Display name", hint: "How clients see you", weight: 20, done: Boolean(p.display_name.trim()) },
    { key: "title", label: "Professional title", hint: "Your headline on proposals", weight: 20, done: Boolean(p.title.trim()) },
    { key: "rate", label: "Hourly rate", hint: "What you charge", weight: 20, done: p.hourly_rate != null },
    { key: "skills", label: "Skills", hint: "Appear in search results", weight: 20, done: p.skills.length > 0 },
    { key: "overview", label: "Overview", hint: "Tell clients what you do best", weight: 20, done: Boolean(p.overview.trim()) },
  ];
}

/** 0–100 completeness — the sum of completed checklist weights. */
export function profileCompleteness(p: IProfileFields): number {
  return profileChecklist(p).reduce((sum, row) => sum + (row.done ? row.weight : 0), 0);
}
