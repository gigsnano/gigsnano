import type {
  ICreateMeetingPayload,
  IMeeting,
  IMeetingActionItem,
  IMeetingTranscriptSegment,
  IUpdateMeetingActionItemPayload,
} from "@/types";

import { APIService } from "../api.service";

class MeetingService extends APIService {
  list(workspaceSlug: string, projectId: string) {
    return this.get<IMeeting[]>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/meetings/`,
    );
  }

  getMeeting(workspaceSlug: string, projectId: string, meetingId: string) {
    return this.get<IMeeting>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/meetings/${meetingId}/`,
    );
  }

  segments(workspaceSlug: string, projectId: string, meetingId: string) {
    return this.get<IMeetingTranscriptSegment[]>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/meetings/${meetingId}/segments/`,
    );
  }

  create(workspaceSlug: string, projectId: string, payload: ICreateMeetingPayload) {
    return this.post<IMeeting>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/meetings/`,
      payload,
    );
  }

  stop(workspaceSlug: string, projectId: string, meetingId: string) {
    return this.post<IMeeting>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/meetings/${meetingId}/stop/`,
    );
  }

  regenerateNotes(workspaceSlug: string, projectId: string, meetingId: string) {
    return this.post<IMeeting>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/meetings/${meetingId}/notes/`,
    );
  }

  actionItems(workspaceSlug: string, projectId: string, meetingId: string) {
    return this.get<IMeetingActionItem[]>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/meetings/${meetingId}/action-items/`,
    );
  }

  updateActionItem(
    workspaceSlug: string,
    projectId: string,
    meetingId: string,
    actionItemId: string,
    payload: IUpdateMeetingActionItemPayload,
  ) {
    return this.patch<IMeetingActionItem>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/meetings/${meetingId}/action-items/${actionItemId}/`,
      payload,
    );
  }

  approveActionItem(
    workspaceSlug: string,
    projectId: string,
    meetingId: string,
    actionItemId: string,
  ) {
    return this.post<IMeetingActionItem>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/meetings/${meetingId}/action-items/${actionItemId}/approve/`,
    );
  }

  dismissActionItem(
    workspaceSlug: string,
    projectId: string,
    meetingId: string,
    actionItemId: string,
  ) {
    return this.post<IMeetingActionItem>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/meetings/${meetingId}/action-items/${actionItemId}/dismiss/`,
    );
  }

  approveActionItems(
    workspaceSlug: string,
    projectId: string,
    meetingId: string,
    ids: string[],
  ) {
    return this.post<IMeetingActionItem[]>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/meetings/${meetingId}/action-items/approve/`,
      { ids },
    );
  }
}

export const meetingService = new MeetingService();
