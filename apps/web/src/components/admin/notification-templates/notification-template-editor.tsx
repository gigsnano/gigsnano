"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  useResetNotificationTemplate,
  useUpdateNotificationTemplate,
} from "@/hooks/admin/use-admin";
import type { INotificationTemplate } from "@/types";

import { TemplateLivePreview } from "./template-live-preview";
import { TemplateVariableChips } from "./template-variable-chips";

function insertAtCursor(
  ref: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>,
  value: string,
  setter: (v: string) => void,
  current: string,
) {
  const el = ref.current;
  if (!el) {
    setter(current + value);
    return;
  }
  const start = el.selectionStart ?? current.length;
  const end = el.selectionEnd ?? current.length;
  const next = current.slice(0, start) + value + current.slice(end);
  setter(next);
  requestAnimationFrame(() => {
    el.focus();
    const pos = start + value.length;
    el.setSelectionRange(pos, pos);
  });
}

export function NotificationTemplateEditor({
  template,
  canManage,
}: {
  template: INotificationTemplate;
  canManage: boolean;
}) {
  const updateTemplate = useUpdateNotificationTemplate();
  const resetTemplate = useResetNotificationTemplate();
  const [titleTemplate, setTitleTemplate] = useState(template.title_template);
  const [bodyTemplate, setBodyTemplate] = useState(template.body_template);
  const [enabled, setEnabled] = useState(template.enabled);
  const [emailEnabled, setEmailEnabled] = useState(template.email_enabled);
  const [emailSubjectTemplate, setEmailSubjectTemplate] = useState(
    template.email_subject_template,
  );
  const [emailBodyTemplate, setEmailBodyTemplate] = useState(
    template.email_body_html_template,
  );
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const emailSubjectRef = useRef<HTMLInputElement>(null);
  const emailBodyRef = useRef<HTMLTextAreaElement>(null);

  // Reset the editable fields when a different template is selected. Done during
  // render via a prev-value comparison rather than an effect, so switching
  // templates doesn't flash the previous one's text for a commit.
  const [prevTemplate, setPrevTemplate] = useState(template);
  if (template !== prevTemplate) {
    setPrevTemplate(template);
    setTitleTemplate(template.title_template);
    setBodyTemplate(template.body_template);
    setEnabled(template.enabled);
    setEmailEnabled(template.email_enabled);
    setEmailSubjectTemplate(template.email_subject_template);
    setEmailBodyTemplate(template.email_body_html_template);
  }

  const dirty =
    titleTemplate !== template.title_template ||
    bodyTemplate !== template.body_template ||
    enabled !== template.enabled ||
    emailEnabled !== template.email_enabled ||
    emailSubjectTemplate !== template.email_subject_template ||
    emailBodyTemplate !== template.email_body_html_template;

  function insertVariable(token: string) {
    const active = document.activeElement;
    if (active === emailBodyRef.current) {
      insertAtCursor(emailBodyRef, token, setEmailBodyTemplate, emailBodyTemplate);
    } else if (active === emailSubjectRef.current) {
      insertAtCursor(emailSubjectRef, token, setEmailSubjectTemplate, emailSubjectTemplate);
    } else if (active === bodyRef.current) {
      insertAtCursor(bodyRef, token, setBodyTemplate, bodyTemplate);
    } else {
      insertAtCursor(titleRef, token, setTitleTemplate, titleTemplate);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{template.label}</h3>
        <p className="text-xs text-muted-foreground">{template.description}</p>
      </div>

      <TemplateVariableChips variables={template.variables} onInsert={insertVariable} />

      <section className="flex flex-col gap-4">
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          In-app notification
        </h4>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted-foreground">Title template</span>
          <input
            ref={titleRef}
            className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
            value={titleTemplate}
            disabled={!canManage}
            onChange={(e) => setTitleTemplate(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted-foreground">Body template</span>
          <textarea
            ref={bodyRef}
            rows={4}
            className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
            value={bodyTemplate}
            disabled={!canManage}
            onChange={(e) => setBodyTemplate(e.target.value)}
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 rounded border-border"
            checked={enabled}
            disabled={!canManage}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span>In-app enabled</span>
        </label>

        <TemplateLivePreview
          template={template}
          titleTemplate={titleTemplate}
          bodyTemplate={bodyTemplate}
        />
      </section>

      <section className="flex flex-col gap-4 border-t border-border pt-4">
        <div>
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Email notification
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Sends when enabled and the recipient has &quot;Email me about notifications&quot; on.
            Security emails (reset, invite) are not controlled here.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 rounded border-border"
            checked={emailEnabled}
            disabled={!canManage}
            onChange={(e) => setEmailEnabled(e.target.checked)}
          />
          <span>Email enabled</span>
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted-foreground">Email subject template</span>
          <input
            ref={emailSubjectRef}
            className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
            value={emailSubjectTemplate}
            disabled={!canManage || !emailEnabled}
            onChange={(e) => setEmailSubjectTemplate(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted-foreground">Email body HTML template</span>
          <textarea
            ref={emailBodyRef}
            rows={5}
            className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
            value={emailBodyTemplate}
            disabled={!canManage || !emailEnabled}
            onChange={(e) => setEmailBodyTemplate(e.target.value)}
          />
        </label>

        {emailEnabled ? (
          <TemplateLivePreview
            template={template}
            titleTemplate={emailSubjectTemplate}
            bodyTemplate={emailBodyTemplate}
            label="Email preview"
          />
        ) : null}
      </section>

      {canManage && (
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={!dirty || updateTemplate.isPending}
            onClick={() =>
              updateTemplate.mutate({
                triggerKey: template.trigger_key,
                payload: {
                  title_template: titleTemplate,
                  body_template: bodyTemplate,
                  enabled,
                  email_enabled: emailEnabled,
                  email_subject_template: emailSubjectTemplate,
                  email_body_html_template: emailBodyTemplate,
                },
              })
            }
          >
            {updateTemplate.isPending ? "Saving…" : "Save"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={resetTemplate.isPending}
            onClick={() => resetTemplate.mutate(template.trigger_key)}
          >
            Reset in-app copy to default
          </Button>
        </div>
      )}
    </div>
  );
}
