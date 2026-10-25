import type { IPrivilege } from "@/types";

export interface IPrivilegeGroup {
  group: string;
  items: IPrivilege[];
}

export function groupPrivileges(privileges: IPrivilege[]): IPrivilegeGroup[] {
  const order: string[] = [];
  const byGroup = new Map<string, IPrivilege[]>();
  for (const p of privileges) {
    if (!byGroup.has(p.group)) {
      byGroup.set(p.group, []);
      order.push(p.group);
    }
    byGroup.get(p.group)!.push(p);
  }
  return order.map((group) => ({ group, items: byGroup.get(group)! }));
}
