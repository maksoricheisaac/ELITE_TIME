"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useNotification } from "@/contexts/notification-context";

export function EmployeesUpdateNotifier() {
  const searchParams = useSearchParams();
  const updated = searchParams?.get("updated") === "1";
  const { showSuccess } = useNotification();

  useEffect(() => {
    if (updated) {
      showSuccess("Les informations de l'employé ont été mises à jour avec succès.");
    }
  }, [showSuccess, updated]);

  return null;
}
