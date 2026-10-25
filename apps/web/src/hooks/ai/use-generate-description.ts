import { useMutation } from "@tanstack/react-query";

import { aiAssistantService } from "@/services/ai/ai-assistant.service";
import type { IGenerateDescriptionPayload } from "@/services/ai/ai-assistant.service";

export function useGenerateDescription(workspaceSlug: string) {
  return useMutation({
    mutationFn: (payload: IGenerateDescriptionPayload) =>
      aiAssistantService.generateDescription(workspaceSlug, payload),
  });
}
