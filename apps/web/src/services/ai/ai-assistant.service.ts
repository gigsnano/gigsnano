import { APIService } from "../api.service";

export interface IGenerateDescriptionPayload {
  prompt: string;
  task: string;
  /** Grounds the generated description in this project's context. */
  project_id?: string;
}

export interface IGenerateDescriptionResponse {
  response_html: string;
}

class AiAssistantService extends APIService {
  generateDescription(
    workspaceSlug: string,
    payload: IGenerateDescriptionPayload,
  ) {
    return this.post<IGenerateDescriptionResponse>(
      `/workspaces/${workspaceSlug}/ai-assistant/`,
      payload,
    );
  }
}

export const aiAssistantService = new AiAssistantService();
