"use client";

/**
 * Voice data hooks (GIN-491 end-to-end wiring).
 *
 * Components never call `fetch` — they call these. The policy query is what
 * decides whether the microphone is offered at all, and it is answered by the
 * server rather than inferred client-side: enablement a browser could assert is
 * not an allowlist.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { APIService } from "@/services/api.service";
import type { IVoiceCredential } from "@/types/voice";

export interface IVoicePolicy {
  enabled: boolean;
  reason: string;
  fallback_to_text: boolean;
  locales: string[];
  require_confirmation: boolean;
  provider: "azure" | "fake";
}

export interface ITranscription {
  transcript: string;
  error: string;
  retryable: boolean;
  session_id: string;
}

class VoiceService extends APIService {
  async policy(workspaceSlug: string): Promise<IVoicePolicy> {
    return this.get(`/workspaces/${workspaceSlug}/voice/policy/`);
  }

  async startSession(workspaceSlug: string, locale: string): Promise<IVoiceCredential> {
    return this.post(`/workspaces/${workspaceSlug}/voice/sessions/`, {
      locale,
      agent_profile_version: 1,
    });
  }

  async endSession(workspaceSlug: string, sessionId: string): Promise<unknown> {
    return this.delete(`/workspaces/${workspaceSlug}/voice/sessions/${sessionId}/`);
  }

  /** Multipart, not JSON — base64 would inflate the payload by a third.
   *  Goes through the base class's postForm so it inherits auth, the /api
   *  prefix and the mock-fallback seam like every other call. */
  async transcribe(
    workspaceSlug: string,
    sessionId: string,
    audio: Blob,
  ): Promise<ITranscription> {
    const form = new FormData();
    form.append("audio", audio, "utterance.wav");
    return this.postForm(
      `/workspaces/${workspaceSlug}/voice/sessions/${sessionId}/audio/`,
      form,
    );
  }
}

const voiceService = new VoiceService();

export const voiceKeys = {
  policy: (workspaceSlug: string) => ["voice", "policy", workspaceSlug] as const,
};

export function useVoicePolicy(workspaceSlug: string) {
  return useQuery({
    queryKey: voiceKeys.policy(workspaceSlug),
    queryFn: () => voiceService.policy(workspaceSlug),
    enabled: Boolean(workspaceSlug),
    // Policy changes are an admin action, not a per-render concern, but it must
    // not be cached so long that flipping the kill switch leaves microphones lit.
    staleTime: 60_000,
    retry: false,
  });
}

export function useStartVoiceSession(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (locale: string) => voiceService.startSession(workspaceSlug, locale),
    // Starting a session revokes the actor's other sessions and begins consuming
    // the workspace's voice minutes, both of which the policy response reports.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: voiceKeys.policy(workspaceSlug) });
    },
  });
}

export function useEndVoiceSession(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => voiceService.endSession(workspaceSlug, sessionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: voiceKeys.policy(workspaceSlug) });
    },
  });
}

export function useTranscribe(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, audio }: { sessionId: string; audio: Blob }) =>
      voiceService.transcribe(workspaceSlug, sessionId, audio),
    // Each utterance spends quota. Left uninvalidated, a workspace that has just
    // exhausted its minutes would keep being offered a microphone.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: voiceKeys.policy(workspaceSlug) });
    },
  });
}
