import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, User as UserIcon, ChevronDown } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import Link from "next/link";

const ROLE_LABELS: Record<string, string> = {
  employee: "Employé",
  admin: "Admin",
  manager: "Manager",
  team_lead: "Team Lead",
};

export const UserNav = () => {
  const { user, logout, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-2">
        <div className="h-8 w-8 rounded-full bg-white/20 animate-pulse" />
        <div className="hidden md:flex flex-col gap-1.5">
          <div className="h-2.5 w-20 bg-white/20 animate-pulse rounded-sm" />
          <div className="h-2 w-12 bg-white/20 animate-pulse rounded-sm" />
        </div>
      </div>
    );
  }

  const initials = `${user?.firstname?.[0] ?? ""}${user?.lastname?.[0] ?? ""}`.toUpperCase();
  const roleLabel = ROLE_LABELS[user?.role ?? ""] ?? user?.role ?? "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild suppressHydrationWarning>
        <Button
          variant="ghost"
          className="relative h-9 rounded-full px-2 hover:bg-white/15 text-white transition-all gap-2"
        >
          <Avatar className="h-7 w-7 ring-2 ring-white/30">
            <AvatarFallback className="bg-white/20 text-white text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="hidden md:flex flex-col items-start">
            <p className="text-xs font-semibold leading-none text-white">{user?.firstname}</p>
            <p className="text-[10px] text-white/60 capitalize leading-none mt-0.5">{roleLabel}</p>
          </div>
          <ChevronDown className="h-3 w-3 text-white/60 hidden md:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="py-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 ring-2 ring-primary/20">
              <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col min-w-0">
              <p className="text-sm font-semibold truncate">{user?.firstname} {user?.lastname}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              <span className="mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary w-fit capitalize">
                {roleLabel}
              </span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user && (
          <DropdownMenuItem asChild className="cursor-pointer gap-2">
            <Link href="/profile">
              <UserIcon className="h-4 w-4 text-muted-foreground" />
              Mon profil
            </Link>
          </DropdownMenuItem>
        )}
        {user && <DropdownMenuSeparator />}
        <DropdownMenuItem
          onClick={logout}
          className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer gap-2"
        >
          <LogOut className="h-4 w-4" />
          Déconnexion
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
