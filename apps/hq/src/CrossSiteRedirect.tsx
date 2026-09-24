import type { ReactNode } from "react";

/** 總部後台：非 HQ 路徑已由 HQDomainRedirect 導回 /hq，此處不需額外跨站規則 */
export function CrossSiteRedirect({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
