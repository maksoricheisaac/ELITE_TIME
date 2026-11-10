"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

/**
 * Notifications : discrètes, contextuelles, lisibles.
 *  - Quatre natures distinctes (succès, avertissement, erreur, information) + « en cours » : fond doux,
 *    texte sémantique (≥ 4,5:1) ET icône différente — jamais la couleur seule.
 *  - Surface pleine (pas de transparence) : une notification doit rester lisible sur n'importe quel contenu.
 *  - Les erreurs restent plus longtemps que les confirmations (voir notification-context) ; au plus 3 visibles.
 *  - Mouvement natif de Sonner (ressort, geste de balayage pour fermer) ; prefers-reduced-motion est
 *    pris en charge par la bibliothèque.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-right"
      visibleToasts={3}
      closeButton
      richColors
      toastOptions={{ duration: 4500 }}
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--success-bg": "var(--success-soft)",
          "--success-text": "var(--success)",
          "--success-border": "color-mix(in srgb, var(--success) 30%, transparent)",
          "--warning-bg": "var(--warning-soft)",
          "--warning-text": "var(--warning)",
          "--warning-border": "color-mix(in srgb, var(--warning) 30%, transparent)",
          "--error-bg": "var(--danger-soft)",
          "--error-text": "var(--danger)",
          "--error-border": "color-mix(in srgb, var(--danger) 30%, transparent)",
          "--info-bg": "var(--info-soft)",
          "--info-text": "var(--info)",
          "--info-border": "color-mix(in srgb, var(--info) 30%, transparent)",
          "--border-radius": "0.75rem",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
