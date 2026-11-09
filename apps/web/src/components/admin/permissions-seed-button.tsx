"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useNotification } from "@/contexts/notification-context";
import { ShieldCheck } from "lucide-react";

export function PermissionsSeedButton() {
  const [loading, setLoading] = useState(false);
  const { showSuccess, showError } = useNotification();

  const handleSeed = async () => {
    if (loading) return;
    setLoading(true);

    try {
      // 1. Seed des permissions
      const permRes = await fetch("/api/admin/seed-permissions", {
        method: "POST",
      });

      if (!permRes.ok) {
        const data = await permRes.json().catch(() => ({}));
        throw new Error(data.error || "Erreur lors du seeding des permissions");
      }

      // 2. Seed des pages + liaisons PagePermission
      const pagesRes = await fetch("/api/admin/seed-pages", {
        method: "GET",
      });

      if (!pagesRes.ok) {
        const data = await pagesRes.json().catch(() => ({}));
        throw new Error(data.error || "Erreur lors du seeding des pages");
      }

      showSuccess(
        "Permissions et pages synchronisées avec succès. La navigation tient compte des dernières permissions."
      );

      // Optionnel : recharger les permissions globales (sidebar, etc.) si disponible
      if ((window as unknown as { refetchPermissions?: () => void | Promise<void> }).refetchPermissions) {
        await (window as unknown as { refetchPermissions: () => void | Promise<void> }).refetchPermissions();
      }

      // Recharger la page pour récupérer la nouvelle liste de permissions côté serveur
      window.location.reload();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erreur lors de l'initialisation des permissions";
      showError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="cursor-pointer"
      onClick={handleSeed}
      disabled={loading}
    >
      <ShieldCheck className="h-4 w-4 mr-2" />
      {loading ? "Initialisation..." : "(Re)initialiser permissions"}
    </Button>
  );
}
