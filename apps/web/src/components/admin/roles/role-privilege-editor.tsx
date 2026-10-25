"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { usePrivileges, useUpdateRole } from "@/hooks/admin/use-admin";
import type { IStaffRole } from "@/types";

import { groupPrivileges } from "./group-privileges";

export function RolePrivilegeEditor({
  role,
  canManage,
}: {
  role: IStaffRole;
  canManage: boolean;
}) {
  const { data: privileges = [], error: privilegesError } = usePrivileges();
  const updateRole = useUpdateRole();
  // Initialized once from role.privileges; the parent remounts this component
  // (via `key={role.id}`) when the selected role changes, so this never needs
  // to reset on a background refetch that returns a new array reference for
  // the same role — that would otherwise silently discard unsaved edits.
  const [selected, setSelected] = useState<Set<string>>(new Set(role.privileges));

  const groups = groupPrivileges(privileges);
  const disabled = role.is_system || !canManage;
  const dirty =
    selected.size !== role.privileges.length ||
    role.privileges.some((p) => !selected.has(p));

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{role.name}</h3>
          <p className="text-xs text-muted-foreground">
            {role.is_system ? "System role — all privileges, read-only" : role.description}
          </p>
        </div>
        {!disabled && (
          <Button
            size="sm"
            disabled={!dirty || updateRole.isPending}
            onClick={() =>
              updateRole.mutate({ roleId: role.id, payload: { privileges: [...selected] } })
            }
          >
            {updateRole.isPending ? "Saving…" : "Save changes"}
          </Button>
        )}
      </div>
      {privilegesError ? (
        <p className="text-sm text-muted-foreground">Couldn&apos;t load privileges. Try again in a moment.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {groups.map((g) => (
            <fieldset key={g.group} className="rounded-lg border border-border p-3">
              <legend className="px-1 text-xs font-medium text-muted-foreground">{g.group}</legend>
              <div className="flex flex-col gap-1.5">
                {g.items.map((p) => {
                  const checked = role.is_system || selected.has(p.key);
                  return (
                    <label key={p.key} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 rounded border-border"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggle(p.key)}
                      />
                      <span className={disabled ? "text-muted-foreground" : "text-foreground"}>
                        {p.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
      )}
    </div>
  );
}
