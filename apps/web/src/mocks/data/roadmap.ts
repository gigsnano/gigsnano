/** Mock initiative row — carries `workspace_slug` + `_total`/`_done` for the
 * rollup handler (not part of the wire InitiativeOut). */
export interface IMockInitiative {
  id: string;
  workspace_slug: string;
  workspace_id: string;
  title: string;
  description: string;
  status: string;
  lead_id: string | null;
  target_date: string | null;
  created_at: string;
  _total: number;
  _done: number;
}

export const initiatives: IMockInitiative[] = [
  {
    id: "init_pay",
    workspace_slug: "acme",
    workspace_id: "ws_1",
    title: "Payments",
    description: "Checkout, ledger and payment reliability.",
    status: "in_progress",
    lead_id: "u_1",
    target_date: "2026-10-08",
    created_at: "2026-07-01T09:00:00Z",
    _total: 8,
    _done: 5,
  },
  {
    id: "init_mob",
    workspace_slug: "acme",
    workspace_id: "ws_1",
    title: "Mobile app",
    description: "Native mobile experience.",
    status: "planned",
    lead_id: "u_2",
    target_date: "2026-09-01",
    created_at: "2026-07-02T09:00:00Z",
    _total: 10,
    _done: 2,
  },
  {
    id: "init_plat",
    workspace_slug: "acme",
    workspace_id: "ws_1",
    title: "Platform hardening",
    description: "Reliability, security and cost.",
    status: "planned",
    lead_id: null,
    target_date: null,
    created_at: "2026-07-03T09:00:00Z",
    _total: 0,
    _done: 0,
  },
];

export interface IMockRelease {
  id: string;
  project_id: string;
  version: string;
  name: string;
  changelog_md: string;
  status: string;
  released_at: string | null;
  created_at: string;
}

export const releases: IMockRelease[] = [
  {
    id: "rel_21",
    project_id: "prj_mba",
    version: "v2.1",
    name: "Payments polish",
    changelog_md: "",
    status: "unreleased",
    released_at: null,
    created_at: "2026-07-14T09:00:00Z",
  },
  {
    id: "rel_20",
    project_id: "prj_mba",
    version: "v2.0",
    name: "Foundation",
    changelog_md:
      "## v2.0 — Foundation\n\n- **Added:** real-data dashboard widgets\n- **Added:** Sprint-0 BMAD flow\n- **Fixed:** Gantt virtual scroll",
    status: "released",
    released_at: "2026-07-01T00:00:00Z",
    created_at: "2026-06-20T09:00:00Z",
  },
];
