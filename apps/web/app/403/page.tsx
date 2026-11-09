import Link from 'next/link';
import { ShieldX, ArrowLeft, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ForbiddenPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-6 max-w-md mx-auto px-6">
        <div className="flex justify-center">
          <div className="rounded-full bg-destructive/10 p-6">
            <ShieldX className="h-16 w-16 text-destructive" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">403</h1>
          <h2 className="text-xl font-semibold text-foreground">Accès refusé</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Vous ne disposez pas des permissions nécessaires pour accéder à cette page.
            Contactez votre administrateur si vous pensez qu&apos;il s&apos;agit d&apos;une erreur.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild variant="default">
            <Link href="/dashboard" className="inline-flex items-center gap-2">
              <Home className="h-4 w-4" />
              Tableau de bord
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="javascript:history.back()" className="inline-flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Retour
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
