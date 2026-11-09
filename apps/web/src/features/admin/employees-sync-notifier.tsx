"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useNotification } from "@/contexts/notification-context";

export function EmployeesSyncNotifier() {
  const searchParams = useSearchParams();
  const synced = searchParams?.get("synced") === "1";
  const syncError = searchParams?.get("synced_error") === "1";
  const syncErrorMessage = searchParams?.get("synced_error_message") || undefined;
  const { showSuccess, showError } = useNotification();

  const hasShownSuccessRef = useRef(false);
  const hasShownErrorRef = useRef(false);

  useEffect(() => {
    if (synced && !hasShownSuccessRef.current) {
      hasShownSuccessRef.current = true;
      showSuccess("Synchronisation des employés avec l'AD terminée.");
    }
  }, [showSuccess, synced]);

  useEffect(() => {
    if (syncError && !hasShownErrorRef.current) {
      hasShownErrorRef.current = true;
      if (syncErrorMessage) {
        showError(`Erreur lors de la synchronisation des employés avec l'AD : ${syncErrorMessage}`);
      } else {
        showError("Erreur lors de la synchronisation des employés avec l'AD.");
      }
    }
  }, [showError, syncError, syncErrorMessage]);

  return null;
}
