import type {
  ICreateCustomFieldPayload,
  ICreateProjectAutomationPayload,
  ICreateProjectEstimatePayload,
  ICreateProjectLabelPayload,
  ICreateProjectStatePayload,
  ICustomFieldDefinition,
  IProjectAutomation,
  IProjectEstimate,
  IProjectFeature,
  IProjectLabel,
  IProjectState,
  IUpdateCustomFieldPayload,
  IUpdateProjectPayload,
} from "@/types";
import type { IProject } from "@/types";

import { APIService } from "../api.service";

class ProjectSettingsService extends APIService {
  updateProject(workspaceSlug: string, projectId: string, payload: IUpdateProjectPayload) {
    return this.patch<IProject>(`/workspaces/${workspaceSlug}/projects/${projectId}/`, payload);
  }

  getLabels(workspaceSlug: string, projectId: string) {
    return this.get<IProjectLabel[]>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/labels/`,
    );
  }

  createLabel(workspaceSlug: string, projectId: string, payload: ICreateProjectLabelPayload) {
    return this.post<IProjectLabel>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/labels/`,
      payload,
    );
  }

  deleteLabel(workspaceSlug: string, projectId: string, labelId: string) {
    return this.delete<{ success: boolean }>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/labels/${labelId}/`,
    );
  }

  getStates(workspaceSlug: string, projectId: string) {
    return this.get<IProjectState[]>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/states/`,
    );
  }

  createState(workspaceSlug: string, projectId: string, payload: ICreateProjectStatePayload) {
    return this.post<IProjectState>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/states/`,
      payload,
    );
  }

  deleteState(workspaceSlug: string, projectId: string, stateId: string) {
    return this.delete<{ success: boolean }>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/states/${stateId}/`,
    );
  }

  getFeatures(workspaceSlug: string, projectId: string) {
    return this.get<IProjectFeature[]>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/features/`,
    );
  }

  updateFeature(workspaceSlug: string, projectId: string, featureId: string, enabled: boolean) {
    return this.patch<IProjectFeature>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/features/${featureId}/`,
      { enabled },
    );
  }

  getEstimates(workspaceSlug: string, projectId: string) {
    return this.get<IProjectEstimate[]>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/estimates/`,
    );
  }

  createEstimate(
    workspaceSlug: string,
    projectId: string,
    payload: ICreateProjectEstimatePayload,
  ) {
    return this.post<IProjectEstimate>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/estimates/`,
      payload,
    );
  }

  deleteEstimate(workspaceSlug: string, projectId: string, estimateId: string) {
    return this.delete<{ success: boolean }>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/estimates/${estimateId}/`,
    );
  }

  getAutomations(workspaceSlug: string, projectId: string) {
    return this.get<IProjectAutomation[]>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/automations/`,
    );
  }

  createAutomation(
    workspaceSlug: string,
    projectId: string,
    payload: ICreateProjectAutomationPayload,
  ) {
    return this.post<IProjectAutomation>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/automations/`,
      payload,
    );
  }

  deleteAutomation(workspaceSlug: string, projectId: string, automationId: string) {
    return this.delete<{ success: boolean }>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/automations/${automationId}/`,
    );
  }

  getCustomFields(workspaceSlug: string, projectId: string) {
    return this.get<ICustomFieldDefinition[]>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/custom-fields/`,
    );
  }

  createCustomField(
    workspaceSlug: string,
    projectId: string,
    payload: ICreateCustomFieldPayload,
  ) {
    return this.post<ICustomFieldDefinition>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/custom-fields/`,
      payload,
    );
  }

  updateCustomField(
    workspaceSlug: string,
    projectId: string,
    customFieldId: string,
    payload: IUpdateCustomFieldPayload,
  ) {
    return this.patch<ICustomFieldDefinition>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/custom-fields/${customFieldId}/`,
      payload,
    );
  }

  deleteCustomField(workspaceSlug: string, projectId: string, customFieldId: string) {
    return this.delete<{ success: boolean }>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/custom-fields/${customFieldId}/`,
    );
  }
}

export const projectSettingsService = new ProjectSettingsService();
