import { ESolutionKey } from "@/types";
import { EIntakeExecution, type IIntakeDefinition } from "@/types/solution/intake";

/**
 * Built-in intake definitions (GIN-444). Backend-owned data living below the
 * service boundary in production — mirrored here so the machine and the mock
 * handlers share one source of truth during frontend-first development.
 *
 * Starting points match `mocks/data/solutions.ts` exactly. Paths that skip
 * greenfield-only questions do so via `applies_to`, not via UI conditionals.
 */

const SD_GREENFIELD = ["idea", "documents", "blueprint"];
const SD_BROWNFIELD = ["repository", "in_flight"];
const SD_BLANK = ["blank"];
const SD_ALL = [...SD_GREENFIELD, ...SD_BROWNFIELD, ...SD_BLANK];

export const softwareDeliveryIntake: IIntakeDefinition = {
  solution_key: ESolutionKey.SoftwareDelivery,
  version: 1,
  starting_points: {
    idea: {
      first_step: "start",
      reduced_automation: false,
      notice: null,
    },
    repository: {
      first_step: "start",
      reduced_automation: false,
      notice: null,
    },
    documents: {
      first_step: "start",
      reduced_automation: false,
      notice: null,
    },
    in_flight: {
      first_step: "start",
      reduced_automation: false,
      notice: null,
    },
    blueprint: {
      first_step: "start",
      reduced_automation: false,
      notice: null,
    },
    blank: {
      first_step: "start",
      reduced_automation: true,
      notice:
        "A blank project skips generated setup. You still get the full work graph — just less of it filled in for you.",
    },
  },
  steps: [
    {
      key: "start",
      label: "Confirm starting point",
      description: "Lock the path this project will take through setup.",
      execution: EIntakeExecution.Form,
      applies_to: null,
      prerequisites: [],
      required: true,
      deferrable: false,
      material_inputs: ["starting_point"],
      next: "context",
    },
    {
      key: "context",
      label: "Describe the project",
      description: "Name, identifier and a short brief — enough for the agents to start.",
      execution: EIntakeExecution.Form,
      applies_to: SD_ALL,
      prerequisites: ["start"],
      required: true,
      deferrable: false,
      material_inputs: ["name", "identifier", "description", "has_ui"],
      next: "structure",
    },
    {
      // Greenfield-only: brownfield and blank skip the "what should we invent"
      // questions because the answer is already in the repo or deliberately empty.
      key: "vision",
      label: "Capture the vision",
      description: "Who is this for and what does success look like?",
      execution: EIntakeExecution.Form,
      applies_to: SD_GREENFIELD,
      prerequisites: ["context"],
      required: false,
      deferrable: true,
      material_inputs: ["vision"],
      next: "structure",
    },
    {
      key: "repository",
      label: "Connect the repository",
      description: "Pick the GitHub repo we will document and plan against.",
      execution: EIntakeExecution.Analysis,
      applies_to: SD_BROWNFIELD,
      prerequisites: ["context"],
      required: true,
      deferrable: false,
      material_inputs: ["repo_full_name"],
      next: "structure",
    },
    {
      key: "structure",
      label: "Define the structure",
      description: "Layers, modules and the shape of the delivery plan.",
      execution: EIntakeExecution.Form,
      applies_to: [...SD_GREENFIELD, ...SD_BROWNFIELD],
      prerequisites: ["context"],
      required: false,
      deferrable: true,
      material_inputs: ["layers", "modules"],
      next: "blueprint",
    },
    {
      key: "blueprint",
      label: "Review generated setup",
      description: "Preview the journey, epics and agents before anything is created.",
      execution: EIntakeExecution.Review,
      applies_to: [...SD_GREENFIELD, ...SD_BROWNFIELD],
      prerequisites: ["structure"],
      required: false,
      deferrable: true,
      material_inputs: ["blueprint_id"],
      next: "connect",
    },
    {
      key: "connect",
      label: "Connect required integrations",
      description: "Authorize only the sources this starting point needs.",
      execution: EIntakeExecution.Connect,
      applies_to: [...SD_GREENFIELD, ...SD_BROWNFIELD],
      prerequisites: ["blueprint"],
      required: false,
      deferrable: true,
      material_inputs: ["connections"],
      next: "own",
    },
    {
      key: "own",
      label: "Assign owners",
      description: "Humans and agents who will carry the first work.",
      execution: EIntakeExecution.Form,
      applies_to: [...SD_GREENFIELD, ...SD_BROWNFIELD],
      prerequisites: ["connect"],
      required: false,
      deferrable: true,
      material_inputs: ["owners"],
      next: "create",
    },
    {
      key: "create",
      label: "Create the project",
      description: "Commit the setup. Nothing exists until this step runs.",
      execution: EIntakeExecution.Review,
      applies_to: null,
      prerequisites: ["context"],
      required: true,
      deferrable: false,
      material_inputs: [],
      next: null,
    },
  ],
};

export const revenueAssuranceIntake: IIntakeDefinition = {
  solution_key: ESolutionKey.RevenueAssurance,
  version: 1,
  starting_points: {
    diagnostic: {
      first_step: "start",
      reduced_automation: false,
      notice: null,
    },
    import: {
      first_step: "start",
      reduced_automation: false,
      notice: null,
    },
    sources: {
      first_step: "start",
      reduced_automation: false,
      notice: null,
    },
    blueprint: {
      first_step: "start",
      reduced_automation: false,
      notice: null,
    },
  },
  steps: [
    {
      key: "start",
      label: "Confirm starting point",
      description: "Lock the assurance path before any source is touched.",
      execution: EIntakeExecution.Form,
      applies_to: null,
      prerequisites: [],
      required: true,
      deferrable: false,
      material_inputs: ["starting_point"],
      next: "scope",
    },
    {
      key: "scope",
      label: "Name the assurance workspace",
      description: "Display name and the period the diagnostic should cover.",
      execution: EIntakeExecution.Form,
      applies_to: null,
      prerequisites: ["start"],
      required: true,
      deferrable: false,
      material_inputs: ["name", "period"],
      next: "sources",
    },
    {
      key: "import_files",
      label: "Import contracts and invoices",
      description: "Upload extracts that become the obligation source of truth.",
      execution: EIntakeExecution.Form,
      applies_to: ["import", "diagnostic"],
      prerequisites: ["scope"],
      required: true,
      deferrable: false,
      material_inputs: ["imports"],
      next: "sources",
    },
    {
      key: "sources",
      label: "Approve document and mailbox sources",
      description: "Selected shared mailboxes and folders only — never every inbox.",
      execution: EIntakeExecution.Connect,
      applies_to: ["sources", "diagnostic", "blueprint"],
      prerequisites: ["scope"],
      required: false,
      deferrable: true,
      material_inputs: ["mailboxes", "folders"],
      next: "controls",
    },
    {
      key: "controls",
      label: "Configure the four controls",
      description: "Deterministic checks that surface missing or blocked revenue.",
      execution: EIntakeExecution.Form,
      applies_to: null,
      prerequisites: ["scope"],
      required: false,
      deferrable: true,
      material_inputs: ["controls"],
      next: "review",
    },
    {
      key: "review",
      label: "Review assurance setup",
      description: "Preview the workspace before it is created.",
      execution: EIntakeExecution.Review,
      applies_to: null,
      prerequisites: ["controls"],
      required: true,
      deferrable: false,
      material_inputs: [],
      next: null,
    },
  ],
};

export const INTAKE_CATALOGUE: IIntakeDefinition[] = [
  softwareDeliveryIntake,
  revenueAssuranceIntake,
];
