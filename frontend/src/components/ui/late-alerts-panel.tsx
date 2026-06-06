"use client";

import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRealtime } from "@/contexts/realtime-context";
import { useAuth } from "@/contexts/auth-context";

export function LateAlertsPanel() {
  const { lateAlerts, clearLateAlerts, adminClosureAlerts, clearAdminClosureAlerts } = useRealtime();
  const { user } = useAuth();

  const canSeeAlerts =
    !!user &&
    (user.role === "employee" ||
      user.role === "admin" ||
      user.role === "manager" ||
      user.role === "team_lead");

  if (!canSeeAlerts) {
    return null;
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setHours(23, 59, 59, 999);

  const todayAlerts = lateAlerts.filter((alert) => {
    const date = new Date(alert.timestamp);
    return date >= todayStart && date <= todayEnd;
  });

  // Clôtures admin visibles uniquement par l'employé concerné
  const myClosureAlerts =
    user.role === "employee"
      ? adminClosureAlerts.filter((a) => a.userId === user.id)
      : [];

  const totalCount = todayAlerts.length + myClosureAlerts.length;

  const handleClearAll = () => {
    clearLateAlerts();
    clearAdminClosureAlerts();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={`relative h-9 w-9 cursor-pointer rounded-full border border-white/10 bg-white/5 text-white shadow-sm hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-0 ${
            totalCount > 0 ? "ring-2 ring-destructive/70" : ""
          }`}
          aria-label="Notifications de retard"
        >
          <Bell className="h-4 w-4 text-white" />
          {totalCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {totalCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {totalCount > 0 && (
            <span className="text-xs font-medium text-muted-foreground">
              {totalCount} en attente
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {totalCount === 0 ? (
          <DropdownMenuItem className="text-xs text-muted-foreground">
            Aucune notification pour le moment.
          </DropdownMenuItem>
        ) : (
          <>
            {/* Notifications de clôture admin (employé uniquement) */}
            {myClosureAlerts.map((alert) => {
              const dateLabel = new Date(alert.date + "T00:00:00").toLocaleDateString("fr-FR");
              return (
                <DropdownMenuItem
                  key={alert.timestamp + alert.userId + alert.date}
                  className="flex flex-col items-start space-y-1 text-xs"
                >
                  <span className="font-medium text-primary">Pointage clôturé</span>
                  <span className="text-muted-foreground">
                    Votre pointage du {dateLabel} a été clôturé par l&apos;administrateur.
                  </span>
                </DropdownMenuItem>
              );
            })}

            {/* Alertes de retard du jour */}
            {todayAlerts.map((alert) => {
              const date = new Date(alert.timestamp);
              const dateLabel = date.toLocaleDateString("fr-FR");
              const timeLabel = date.toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
              });

              const isSelf =
                user && alert.userId === user.id && user.role === "employee";

              const title = isSelf
                ? "Votre retard"
                : `Retard de ${alert.userName}`;

              const delayText =
                alert.delayLabel ??
                (alert.delayMinutes != null ? `${alert.delayMinutes} min` : null);

              return (
                <DropdownMenuItem
                  key={alert.timestamp + alert.userId}
                  className="flex flex-col items-start space-y-1 text-xs"
                >
                  <span className="font-medium">{title}</span>
                  <span className="text-muted-foreground">
                    {delayText ? `Durée : ${delayText} - ` : ""}
                    {dateLabel} à {timeLabel}
                  </span>
                  {alert.workStartTime && alert.entryTime && (
                    <span className="text-[11px] text-muted-foreground">
                      Prévu : {alert.workStartTime} - Entrée : {alert.entryTime}
                    </span>
                  )}
                </DropdownMenuItem>
              );
            })}

            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                handleClearAll();
              }}
              className="justify-center text-xs font-semibold text-primary cursor-pointer"
            >
              Tout marquer comme lu
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
