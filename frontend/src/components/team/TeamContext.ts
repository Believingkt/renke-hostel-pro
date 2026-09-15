import { createContext, useContext } from "react";
import type { TeamRole } from "./teamConfig";

export interface TeamContextValue {
  userId: string;
  email: string;
  displayName: string;
  roles: TeamRole[];
}

export const TeamContext = createContext<TeamContextValue | null>(null);

export function useTeam(): TeamContextValue {
  const ctx = useContext(TeamContext);
  if (!ctx) {
    throw new Error("useTeam must be used within TeamLayout");
  }
  return ctx;
}
