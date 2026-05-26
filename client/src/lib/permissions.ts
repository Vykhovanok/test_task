import type { EffectiveRole } from "./models";

export class PermissionPolicy {
  static canEdit(role: EffectiveRole | null): boolean {
    return role === "owner" || role === "editor";
  }
}
