"use client";

import { useAuth } from "@/contexts/auth-context";

export function LogoutOverlay() {
  const { isLoggingOut } = useAuth();

  if (!isLoggingOut) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="rounded-lg border bg-card px-6 py-4 shadow-lg text-center space-y-2">
        <p className="text-sm font-semibold">Déconnexion en cours...</p>
        <p className="text-xs text-muted-foreground">
          Merci de patienter, vos informations sont en cours de sécurisation.
        </p>
      </div>
    </div>
  );
}
