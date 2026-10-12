"use client";

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import { useAuth } from "@/contexts/auth-context";
import { useNotification } from "@/contexts/notification-context";
import { useUserPermissions } from "@/hooks/use-user-permissions";

export type LateAlertPayload = {
  userId: string;
  userName: string;
  timestamp: string;
  /** Durée du retard en minutes (si disponible) */
  delayMinutes?: number | null;
  /** Durée du retard formatée (ex: "15 min", "1h30min") */
  delayLabel?: string | null;
  /** Heure de début de travail prévue (HH:mm) si connue */
  workStartTime?: string | null;
  /** Heure réelle de pointage d'entrée (HH:mm) si connue */
  entryTime?: string | null;
};

export type PointageReminderPayload = {
  userId: string;
  message: string;
  timestamp: string;
};

export type AdminClosurePayload = {
  userId: string;
  userName: string;
  /** Date du pointage clôturé (YYYY-MM-DD) */
  date: string;
  timestamp: string;
};

export type LeaveStatusChangedPayload = {
  absenceId: string;
  status: "approved" | "rejected" | "cancelled";
  comment?: string;
};

export type LeaveRequestCreatedPayload = {
  absenceId: string;
  userId: string;
  userName: string;
  department: string | null;
};

interface RealtimeContextType {
  lateAlerts: LateAlertPayload[];
  clearLateAlerts: () => void;
  emitLateAlert: (payload: LateAlertPayload) => void;
  adminClosureAlerts: AdminClosurePayload[];
  clearAdminClosureAlerts: () => void;
  emitAdminClosure: (payload: AdminClosurePayload) => void;
}

const RealtimeContext = createContext<RealtimeContextType | undefined>(undefined);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [lateAlerts, setLateAlerts] = useState<LateAlertPayload[]>([]);
  const [adminClosureAlerts, setAdminClosureAlerts] = useState<AdminClosurePayload[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const { showInfo, showSuccess } = useNotification();
  const { has: hasPermission } = useUserPermissions();
  const router = useRouter();

  useEffect(() => {
    if (!user) {
      return;
    }

    const url =
      process.env.NEXT_PUBLIC_SOCKET_URL ||
      (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");

    let socketUrl = url;
    if (!url.startsWith('http')) {
      socketUrl = `http://${url}`;
    }

    const socket = io(socketUrl, {
      transports: ["websocket", "polling"],
      path: "/socket.io",
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      forceNew: true,
    });

    socketRef.current = socket;

    const handleLateAlert = (payload: LateAlertPayload) => {
      if (user.role === "employee" && payload.userId === user.id) {
        setLateAlerts((prev) => [...prev, payload]);
      } else if (user.role === "admin" || user.role === "manager") {
        setLateAlerts((prev) => [...prev, payload]);
      }
    };

    const handlePointageExitReminder = (payload: PointageReminderPayload) => {
      if (user.role !== "employee") return;
      if (payload.userId !== user.id) return;
      showInfo(payload.message);
    };

    const handleAdminClosure = (payload: AdminClosurePayload) => {
      if (user.role !== "employee") return;
      if (payload.userId !== user.id) return;
      const dateLabel = new Date(payload.date + "T00:00:00").toLocaleDateString("fr-FR");
      showInfo(`Votre pointage du ${dateLabel} a été clôturé par l'administrateur.`);
      setAdminClosureAlerts((prev) => [...prev, payload]);
    };

    const handleLeaveStatusChanged = (payload: LeaveStatusChangedPayload) => {
      if (payload.status === "approved") {
        showSuccess("Votre demande de congé a été approuvée.");
      } else if (payload.status === "rejected") {
        showInfo("Votre demande de congé a été refusée.");
      } else {
        showInfo("Votre demande de congé a été annulée.");
      }
      router.refresh();
    };

    const handleLeaveRequestCreated = (payload: LeaveRequestCreatedPayload) => {
      if (!hasPermission("absences.approve")) return;
      showInfo(`Nouvelle demande de congé de ${payload.userName}.`);
      router.refresh();
    };

    socket.on("employee_late_alert", handleLateAlert);
    socket.on("employee_pointage_exit_reminder", handlePointageExitReminder);
    socket.on("pointage_admin_closure", handleAdminClosure);
    socket.on("leave_status_changed", handleLeaveStatusChanged);
    socket.on("leave_request_created", handleLeaveRequestCreated);

    return () => {
      socket.off("employee_late_alert", handleLateAlert);
      socket.off("employee_pointage_exit_reminder", handlePointageExitReminder);
      socket.off("pointage_admin_closure", handleAdminClosure);
      socket.off("leave_status_changed", handleLeaveStatusChanged);
      socket.off("leave_request_created", handleLeaveRequestCreated);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user, showInfo, showSuccess, router, hasPermission]);

  const clearLateAlerts = () => setLateAlerts([]);
  const clearAdminClosureAlerts = () => setAdminClosureAlerts([]);

  const emitLateAlert = (payload: LateAlertPayload) => {
    if (!socketRef.current) return;
    socketRef.current.emit("employee_late_alert", payload);
  };

  const emitAdminClosure = (payload: AdminClosurePayload) => {
    if (!socketRef.current) return;
    socketRef.current.emit("pointage_admin_closure", payload);
  };

  return (
    <RealtimeContext.Provider value={{
      lateAlerts,
      clearLateAlerts,
      emitLateAlert,
      adminClosureAlerts,
      clearAdminClosureAlerts,
      emitAdminClosure,
    }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  const ctx = useContext(RealtimeContext);
  if (!ctx) {
    throw new Error("useRealtime must be used within a RealtimeProvider");
  }
  return ctx;
}
