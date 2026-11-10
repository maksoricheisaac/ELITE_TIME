'use client';

import * as React from 'react';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { XIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useDragDismiss } from '@/hooks/use-drag-dismiss';

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  // Voile + animations : voir app/motion.css (data-slot="sheet-overlay")
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn('fixed inset-0 z-50', className)}
      {...props}
    />
  );
}

/**
 * Feuille latérale (menu mobile, panneaux).
 *  - Entrée et sortie par le même bord (chemin symétrique), 300 ms / 220 ms (motion.css, `data-sheet`).
 *  - Gauche / droite : glisser vers le bord pour fermer, au toucher uniquement. Le geste ne démarre que si
 *    le mouvement est franchement horizontal vers le bord ; le défilement vertical reste au navigateur.
 */
function SheetContent({
  className,
  children,
  side = 'right',
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const closeRef = React.useRef<HTMLButtonElement | null>(null);
  const horizontal = side === 'left' || side === 'right';
  const { handlers, reset } = useDragDismiss({
    targetRef: contentRef,
    axis: 'x',
    direction: side === 'left' ? -1 : 1,
    mode: 'surface',
    enabled: horizontal,
    pointerTypes: ['touch', 'pen'],
    onDismiss: () => closeRef.current?.click(),
  });

  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-sheet=""
        data-side={side}
        ref={(node) => {
          contentRef.current = node;
          if (node) reset();
        }}
        className={cn(
          'bg-background fixed z-50 flex flex-col gap-4 shadow-[var(--shadow-popover)]',
          horizontal && 'touch-pan-y overscroll-contain',
          side === 'right' && 'inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm',
          side === 'left' && 'inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm',
          side === 'top' && 'inset-x-0 top-0 h-auto border-b',
          side === 'bottom' && 'inset-x-0 bottom-0 h-auto border-t',
          className,
        )}
        {...(horizontal ? handlers : {})}
        {...props}
      >
        {children}
        <SheetPrimitive.Close ref={closeRef} tabIndex={-1} aria-hidden="true" className="sr-only" />
        <SheetPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-secondary absolute top-4 right-4 flex size-8 items-center justify-center rounded-md opacity-70 transition-[opacity,background-color,scale] duration-150 hover:bg-accent hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden active:scale-90 disabled:pointer-events-none max-md:size-11">
          <XIcon className="size-4" />
          <span className="sr-only">Fermer</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn('flex flex-col gap-1.5 p-4', className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn('mt-auto flex flex-col gap-2 p-4', className)}
      {...props}
    />
  );
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn('text-foreground font-semibold', className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
