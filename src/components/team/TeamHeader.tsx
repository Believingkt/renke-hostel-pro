import { useLocation } from "react-router-dom";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { PAGE_TITLES } from "./teamConfig";
import { useTeam } from "./TeamContext";

export function TeamHeader() {
  const { pathname } = useLocation();
  const { displayName } = useTeam();

  const title =
    PAGE_TITLES[pathname] ||
    Object.entries(PAGE_TITLES).find(
      ([path]) => path !== "/team" && pathname.startsWith(path),
    )?.[1] ||
    "行銷團隊後台";

  return (
    <header className="sticky top-0 z-40 flex h-14 md:h-16 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 md:px-6">
      <SidebarTrigger className="h-9 w-9 md:h-10 md:w-10" />
      <h1 className="text-base md:text-lg font-semibold truncate">{title}</h1>
      <div className="flex-1" />
      <span className="text-sm text-muted-foreground truncate max-w-[40%]">
        {displayName}
      </span>
    </header>
  );
}
