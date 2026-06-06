
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireNavigationAccessById } from '@/lib/navigation-guard';

export default async function AppValidationsPage() {
  await requireNavigationAccessById('validations');

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          Validations
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Validations</h1>
        <p className="text-sm text-muted-foreground">
          Espace réservé pour la gestion des validations (corrections de pointage, absences, etc.).
        </p>
      </div>

      <Card className="border border-border/80 bg-card/90 shadow-sm">
        <CardHeader>
          <CardTitle>Validations à traiter</CardTitle>
          <CardDescription>
            Cette page est prête à accueillir la logique métier de validation. Aucune validation n&apos;est encore implémentée.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Aucune validation disponible pour le moment.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
