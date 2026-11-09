"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useNotification } from "@/contexts/notification-context";

export default function ProfileUpdateNotifier() {
  const searchParams = useSearchParams();
  const { showSuccess } = useNotification();
  const hasShownRef = useRef(false);

  useEffect(() => {
    const updated = searchParams.get("updated");
    const passwordUpdated = searchParams.get("password_updated");

    if (passwordUpdated === "1" && !hasShownRef.current) {
      showSuccess("✅ Mot de passe mis à jour avec succès");
      hasShownRef.current = true;
      return;
    }

    if (updated === "1" && !hasShownRef.current) {
      showSuccess("✅ Profil mis à jour avec succès");
      hasShownRef.current = true;
    }
  }, [searchParams, showSuccess]);

  return null;
}
