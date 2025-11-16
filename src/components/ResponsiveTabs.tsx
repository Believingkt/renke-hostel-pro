import { LucideIcon } from "lucide-react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface TabItem {
  value: string;
  label: string;
  icon: LucideIcon;
}

interface ResponsiveTabsProps {
  tabs: TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  desktopClassName?: string;
  mobileClassName?: string;
  mobileBreakpoint?: "sm" | "md" | "lg";
  showGradient?: boolean;
  selectHeight?: "sm" | "md" | "lg";
  selectWidth?: string;
}

export function ResponsiveTabs({
  tabs,
  value,
  onValueChange,
  className,
  desktopClassName,
  mobileClassName,
  mobileBreakpoint = "lg",
  showGradient = true,
  selectHeight = "lg",
  selectWidth = "w-full",
}: ResponsiveTabsProps) {
  const currentTab = tabs.find(tab => tab.value === value);
  const breakpointClass = mobileBreakpoint === "md" ? "md" : "lg";
  const hiddenDesktop = mobileBreakpoint === "md" ? "md:hidden" : "lg:hidden";
  const hiddenMobile = mobileBreakpoint === "md" ? "hidden md:flex" : "hidden lg:grid";
  const heightClass = selectHeight === "sm" ? "h-9" : selectHeight === "md" ? "h-10" : "h-12";

  return (
    <div className={className}>
      {/* 手機版：下拉選單 */}
      <div className={cn(hiddenDesktop, "mb-4", mobileClassName)}>
        <Select value={value} onValueChange={onValueChange}>
          <SelectTrigger className={cn(selectWidth, "bg-background border-border/50 shadow-sm", heightClass)}>
            <SelectValue>
              {currentTab && (
                <div className="flex items-center gap-2">
                  <currentTab.icon className="h-4 w-4" />
                  <span>{currentTab.label}</span>
                </div>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="z-50 bg-background border-border">
            {tabs.map((tab) => (
              <SelectItem key={tab.value} value={tab.value}>
                <div className="flex items-center gap-2">
                  <tab.icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 桌面版：Tab 列表 */}
      <TabsList
        className={cn(
          hiddenMobile,
          showGradient 
            ? "h-14 bg-gradient-to-r from-muted/50 to-muted/30 p-1.5 rounded-xl border border-border/50"
            : "",
          desktopClassName
        )}
        style={showGradient ? { gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` } : undefined}
      >
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            className={cn(
              "flex items-center gap-2",
              showGradient && "data-[state=active]:bg-gradient-to-br data-[state=active]:from-primary data-[state=active]:to-primary/80 data-[state=active]:text-primary-foreground transition-all duration-300"
            )}
          >
            <tab.icon className="h-4 w-4" />
            <span className={showGradient ? "font-medium" : ""}>{tab.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </div>
  );
}

