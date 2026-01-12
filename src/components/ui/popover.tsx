import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "@/lib/utils";

const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
    container?: HTMLElement | null;
  }
>(({ className, align = "center", sideOffset = 4, container, ...props }, ref) => {
  // 獲取最近的主題容器
  const [themeContainer, setThemeContainer] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    // 尋找帶有主題 class 的最近祖先元素
    const findThemeContainer = () => {
      const themeElement = document.querySelector('[class*="theme-"]');
      if (themeElement instanceof HTMLElement) {
        return themeElement;
      }
      return null;
    };
    
    setThemeContainer(findThemeContainer());
  }, []);

  // 獲取主題 class
  const themeClass = themeContainer?.className
    .split(' ')
    .find(c => c.startsWith('theme-')) || '';

  return (
    <PopoverPrimitive.Portal container={container}>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          themeClass,
          "z-[100] w-72 rounded-lg border bg-popover p-4 text-popover-foreground shadow-md outline-none pointer-events-auto data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 transition-all",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
});
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent };