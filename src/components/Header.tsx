import { Bell, MessageSquare, Gift, Moon } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-sm">
      <div className="flex h-14 md:h-16 items-center justify-between px-4 md:px-6">
        <SidebarTrigger />
        
        <div className="flex items-center gap-2 md:gap-4">
          <Button variant="ghost" size="icon" className="relative h-9 w-9 md:h-10 md:w-10">
            <Bell className="h-4 w-4 md:h-5 md:w-5" />
            <span className="absolute right-1.5 top-1.5 md:right-2 md:top-2 h-2 w-2 rounded-full bg-primary"></span>
          </Button>
          <Button variant="ghost" size="icon" className="relative h-9 w-9 md:h-10 md:w-10 hidden sm:inline-flex">
            <MessageSquare className="h-4 w-4 md:h-5 md:w-5" />
            <span className="absolute right-1.5 top-1.5 md:right-2 md:top-2 h-2 w-2 rounded-full bg-primary"></span>
          </Button>
          <Button variant="ghost" size="icon" className="relative h-9 w-9 md:h-10 md:w-10 hidden sm:inline-flex">
            <Gift className="h-4 w-4 md:h-5 md:w-5" />
            <span className="absolute right-1.5 top-1.5 md:right-2 md:top-2 h-2 w-2 rounded-full bg-primary"></span>
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9 md:h-10 md:w-10 hidden md:inline-flex">
            <Moon className="h-4 w-4 md:h-5 md:w-5" />
          </Button>
          
          <div className="flex items-center gap-2 md:gap-3">
            <Avatar className="h-8 w-8 md:h-10 md:w-10">
              <AvatarImage src="https://api.dicebear.com/7.x/avataaars/svg?seed=Admin" />
              <AvatarFallback className="text-xs md:text-sm">管理</AvatarFallback>
            </Avatar>
            <div className="hidden lg:block">
              <p className="text-sm font-medium">您好, nokimi</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
