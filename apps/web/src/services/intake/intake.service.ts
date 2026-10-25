import type {
  IAcceptTriagePayload,
  ICaptureTriagePayload,
  ICreateCustomerPayload,
  ICustomer,
  IIntakeLink,
  IPublicIntakePayload,
  ITriageItem,
} from "@/types";

import { APIService } from "../api.service";

class IntakeService extends APIService {
  getTriage(workspaceSlug: string) {
    return this.get<ITriageItem[]>(`/workspaces/${workspaceSlug}/triage/`);
  }

  capture(workspaceSlug: string, payload: ICaptureTriagePayload) {
    return this.post<ITriageItem>(`/workspaces/${workspaceSlug}/triage/`, payload);
  }

  /** Run the Analyst engine: classify, dedupe, enrich, prioritize, route. */
  process(workspaceSlug: string, itemId: string) {
    return this.post<ITriageItem>(
      `/workspaces/${workspaceSlug}/triage/${itemId}/process/`,
      {},
    );
  }

  accept(workspaceSlug: string, itemId: string, payload: IAcceptTriagePayload) {
    return this.post<ITriageItem>(
      `/workspaces/${workspaceSlug}/triage/${itemId}/accept/`,
      payload,
    );
  }

  dismiss(workspaceSlug: string, itemId: string) {
    return this.post<ITriageItem>(
      `/workspaces/${workspaceSlug}/triage/${itemId}/dismiss/`,
      {},
    );
  }

  getCustomers(workspaceSlug: string) {
    return this.get<ICustomer[]>(`/workspaces/${workspaceSlug}/customers/`);
  }

  createCustomer(workspaceSlug: string, payload: ICreateCustomerPayload) {
    return this.post<ICustomer>(`/workspaces/${workspaceSlug}/customers/`, payload);
  }

  /** Admin: mint a shareable, workspace-scoped public-form link. */
  createIntakeLink(workspaceSlug: string) {
    return this.post<IIntakeLink>(`/workspaces/${workspaceSlug}/intake-link/`, {});
  }

  /** Unauthenticated public-form submit; the workspace comes from the token. */
  submitPublicIntake(token: string, payload: IPublicIntakePayload) {
    return this.post<{ received: boolean }>(`/public/intake/${token}/`, payload);
  }
}

export const intakeService = new IntakeService();
