import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from '@/lib/utils'

/**
 * Bouton (design-system/MASTER.md §6 + passe « Apple Design »).
 *  - Réponse immédiate : la compression (scale 0.97) démarre à l'appui (`:active`), pas au relâchement,
 *    en 75 ms ; le retour à l'état initial prend 150 ms.
 *  - Aucune élévation au survol : seul le fond change.
 *  - Seules les propriétés utiles sont animées (pas de `transition-all`).
 *  - `prefers-reduced-motion` : plus de compression, le changement de fond reste.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium cursor-pointer select-none shrink-0 outline-none [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 " +
    "transition-[color,background-color,border-color,box-shadow,scale,opacity] duration-150 ease-out active:duration-75 active:scale-[0.97] motion-reduce:active:scale-100 " +
    "focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:border-ring " +
    "disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 aria-busy:pointer-events-none " +
    "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-brand-800 active:bg-brand-800 dark:hover:bg-primary/85 dark:active:bg-primary/80",
        destructive:
          "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90 active:bg-destructive/85 focus-visible:ring-destructive/25",
        outline:
          "border border-input bg-card shadow-xs hover:bg-accent hover:text-accent-foreground active:bg-accent",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/70 active:bg-secondary/60",
        ghost:
          "hover:bg-accent hover:text-accent-foreground active:bg-accent/80",
        link:
          "text-primary underline-offset-4 hover:underline active:scale-100",
        success:
          "bg-success text-success-foreground shadow-xs hover:bg-success/90 active:bg-success/85",
        warning:
          "bg-warning text-warning-foreground shadow-xs hover:bg-warning/90 active:bg-warning/85",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3 max-md:h-11 max-md:px-5",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5 text-xs max-md:h-10",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4 max-md:h-12",
        icon: "size-9 max-md:size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** Action en cours : spinner, interactions bloquées, libellé conservé (pas de saut de mise en page) */
    loading?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
          {children}
        </>
      )}
    </Comp>
  )
}

export { Button, buttonVariants }
