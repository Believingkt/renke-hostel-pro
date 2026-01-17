import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export type ActionType = "create" | "update" | "delete" | "enable" | "disable" | "clone" | "backup" | "restore" | "login" | "logout" | "sync";
export type ActionCategory = "accommodation" | "user" | "order" | "system" | "backup" | "auth";

interface LogActionParams {
  actionType: ActionType;
  actionCategory: ActionCategory;
  entityType: string;
  entityId: string;
  entityName: string;
  accommodationId?: string | null;
  details?: Record<string, unknown>;
}

export function useAuditLog() {
  const logAction = useCallback(async ({
    actionType,
    actionCategory,
    entityType,
    entityId,
    entityName,
    accommodationId = null,
    details = {},
  }: LogActionParams) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from("audit_logs").insert([{
        user_id: user.id,
        user_email: user.email,
        action_type: actionType,
        action_category: actionCategory,
        entity_type: entityType,
        entity_id: entityId,
        entity_name: entityName,
        accommodation_id: accommodationId,
        details: details as Json,
      }]);
    } catch (error) {
      console.error("Error logging action:", error);
    }
  }, []);

  return { logAction };
}

// Convenience functions for common log actions
export const createAuditLogHelper = () => {
  const logAction = async ({
    actionType,
    actionCategory,
    entityType,
    entityId,
    entityName,
    accommodationId = null,
    details = {},
  }: LogActionParams) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from("audit_logs").insert([{
        user_id: user.id,
        user_email: user.email,
        action_type: actionType,
        action_category: actionCategory,
        entity_type: entityType,
        entity_id: entityId,
        entity_name: entityName,
        accommodation_id: accommodationId,
        details: details as Json,
      }]);
    } catch (error) {
      console.error("Error logging action:", error);
    }
  };

  return { logAction };
};
