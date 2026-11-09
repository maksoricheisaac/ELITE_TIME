import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Shield, Key, Users, Settings, FileText, Clock, CheckCircle, Activity } from 'lucide-react';
import Link from 'next/link';

const PERMISSION_CATEGORIES = [
  {
    name: 'Pointages',
    icon: Clock,
    description: 'Consultation et gestion des pointages',
    permissions: [
      { name: 'pointages.view_self',  description: 'Voir ses propres pointages' },
      { name: 'pointages.view_team',  description: 'Voir les pointages de son équipe' },
      { name: 'pointages.view_all',   description: 'Voir tous les pointages sans restriction' },
      { name: 'pointages.create',     description: 'Créer un pointage pour un employé' },
      { name: 'pointages.edit',       description: 'Modifier un pointage existant' },
      { name: 'pointages.delete',     description: 'Supprimer une session de pointage' },
      { name: 'pointages.close_session', description: 'Forcer la clôture d\'une session ouverte' },
      { name: 'pointages.export',     description: 'Exporter les données de pointage' },
    ],
  },
  {
    name: 'Absences',
    icon: CheckCircle,
    description: 'Gestion des demandes d\'absence',
    permissions: [
      { name: 'absences.view_self',       description: 'Voir ses propres absences' },
      { name: 'absences.view_team',       description: 'Voir les absences de son équipe' },
      { name: 'absences.view_all',        description: 'Voir toutes les absences sans restriction' },
      { name: 'absences.approve',         description: 'Approuver une demande d\'absence' },
      { name: 'absences.reject',          description: 'Rejeter une demande d\'absence' },
      { name: 'absences.create_managed',  description: 'Créer une absence pour le compte d\'un employé' },
      { name: 'absences.edit_managed',    description: 'Modifier l\'absence d\'un employé' },
      { name: 'absences.delete_managed',  description: 'Supprimer l\'absence d\'un employé' },
      { name: 'absences.export',          description: 'Exporter les données d\'absences' },
    ],
  },
  {
    name: 'Rapports',
    icon: FileText,
    description: 'Consultation et export de rapports',
    permissions: [
      { name: 'reports.view_self',     description: 'Voir son propre rapport' },
      { name: 'reports.view_team',     description: 'Voir les rapports de son équipe' },
      { name: 'reports.view_all',      description: 'Voir tous les rapports' },
      { name: 'reports.generate',      description: 'Générer un rapport' },
      { name: 'reports.export_pdf',    description: 'Exporter un rapport en PDF' },
      { name: 'reports.export_excel',  description: 'Exporter un rapport en Excel' },
      { name: 'reports.schedule',      description: 'Planifier l\'envoi automatique d\'un rapport' },
    ],
  },
  {
    name: 'Employés',
    icon: Users,
    description: 'Gestion des comptes utilisateurs',
    permissions: [
      { name: 'employees.view_self',      description: 'Voir son propre profil' },
      { name: 'employees.view_team',      description: 'Voir les employés de son équipe' },
      { name: 'employees.view_all',       description: 'Voir tous les employés' },
      { name: 'employees.create',         description: 'Créer un nouvel employé' },
      { name: 'employees.edit',           description: 'Modifier les données d\'un employé' },
      { name: 'employees.delete',         description: 'Désactiver un compte employé' },
      { name: 'employees.reset_password', description: 'Réinitialiser le mot de passe d\'un employé' },
      { name: 'employees.export',         description: 'Exporter la liste des employés' },
    ],
  },
  {
    name: 'Logs',
    icon: Activity,
    description: 'Consultation des journaux d\'activité',
    permissions: [
      { name: 'logs.view',          description: 'Voir les logs système' },
      { name: 'logs.export',        description: 'Exporter les logs' },
      { name: 'logs.view_auth',     description: 'Voir les événements d\'authentification' },
      { name: 'logs.view_security', description: 'Voir les événements de sécurité' },
    ],
  },
  {
    name: 'Paramètres',
    icon: Settings,
    description: 'Configuration système',
    permissions: [
      { name: 'settings.view',          description: 'Voir les paramètres système' },
      { name: 'settings.work_hours',    description: 'Configurer les horaires de travail' },
      { name: 'settings.email',         description: 'Configurer l\'envoi d\'emails' },
      { name: 'settings.security',      description: 'Configurer la sécurité' },
      { name: 'settings.ldap',          description: 'Configurer la connexion LDAP' },
      { name: 'settings.ai',            description: 'Configurer le service IA' },
    ],
  },
  {
    name: 'Permissions',
    icon: Shield,
    description: 'Gestion du système de permissions',
    permissions: [
      { name: 'permissions.view',   description: 'Voir les permissions disponibles et attribuées' },
      { name: 'permissions.assign', description: 'Attribuer une permission à un utilisateur' },
      { name: 'permissions.revoke', description: 'Révoquer une permission d\'un utilisateur' },
      { name: 'permissions.reset',  description: 'Réinitialiser aux permissions de rôle' },
      { name: 'permissions.audit',  description: 'Voir l\'historique des changements' },
    ],
  },
];

export default function PermissionsGuidePage() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
          <Shield className="h-3 w-3" />
          Guide
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Guide des permissions</h1>
        <p className="text-sm text-muted-foreground">
          Comprendre et utiliser le système de permissions granulaires <code>module.action</code> pour contrôler l&apos;accès aux fonctionnalités.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Comment ça fonctionne ?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3">
              <Badge variant="outline" className="mt-1">1</Badge>
              <div>
                <h4 className="font-medium">Format module.action</h4>
                <p className="text-sm text-muted-foreground">
                  Chaque permission suit le format <code>module.action</code> : ex. <code>absences.approve</code>, <code>reports.export_pdf</code>.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Badge variant="outline" className="mt-1">2</Badge>
              <div>
                <h4 className="font-medium">Admins</h4>
                <p className="text-sm text-muted-foreground">
                  Les administrateurs ont automatiquement toutes les permissions sans attribution manuelle.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Badge variant="outline" className="mt-1">3</Badge>
              <div>
                <h4 className="font-medium">Attribution</h4>
                <p className="text-sm text-muted-foreground">
                  Utilisez la page <Link href="/permissions" className="text-primary hover:underline">Permissions</Link> pour attribuer des droits spécifiques.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Cas d&apos;usage courants
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <h4 className="font-medium">Manager RH (employee étendu)</h4>
              <p className="text-sm text-muted-foreground">
                Attribuer&nbsp;
                <Badge variant="secondary" className="text-xs">employees.view_all</Badge>{' '}
                <Badge variant="secondary" className="text-xs">employees.edit</Badge>{' '}
                <Badge variant="secondary" className="text-xs">absences.approve</Badge>
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">Responsable reporting</h4>
              <p className="text-sm text-muted-foreground">
                Attribuer&nbsp;
                <Badge variant="secondary" className="text-xs">reports.view_team</Badge>{' '}
                <Badge variant="secondary" className="text-xs">reports.export_pdf</Badge>{' '}
                <Badge variant="secondary" className="text-xs">reports.export_excel</Badge>
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">Chargé de planification</h4>
              <p className="text-sm text-muted-foreground">
                Attribuer&nbsp;
                <Badge variant="secondary" className="text-xs">pointages.view_team</Badge>{' '}
                <Badge variant="secondary" className="text-xs">absences.view_team</Badge>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Détail des permissions par module</h2>

        {PERMISSION_CATEGORIES.map((category) => {
          const Icon = category.icon;
          return (
            <Card key={category.name}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icon className="h-5 w-5" />
                  {category.name}
                </CardTitle>
                <CardDescription>{category.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-2">
                  {category.permissions.map((permission) => (
                    <div key={permission.name} className="flex items-start gap-3 p-3 rounded-lg border">
                      <Key className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <code className="text-xs font-mono font-semibold text-primary break-all">
                          {permission.name}
                        </code>
                        <p className="text-xs text-muted-foreground mt-1">
                          {permission.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bonnes pratiques</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <CheckCircle className="h-5 w-5 mt-0.5 text-green-600 shrink-0" />
            <div>
              <h4 className="font-medium">Principe du moindre privilège</h4>
              <p className="text-sm text-muted-foreground">
                Accordez uniquement les permissions nécessaires à l&apos;utilisateur pour accomplir son rôle.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle className="h-5 w-5 mt-0.5 text-green-600 shrink-0" />
            <div>
              <h4 className="font-medium">Révocation régulière</h4>
              <p className="text-sm text-muted-foreground">
                Passez en revue les permissions accordées et révoquez celles qui ne sont plus nécessaires.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle className="h-5 w-5 mt-0.5 text-green-600 shrink-0" />
            <div>
              <h4 className="font-medium">Granularité</h4>
              <p className="text-sm text-muted-foreground">
                Préférez attribuer <code>absences.approve</code> seul plutôt qu&apos;un accès global à toutes les absences.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-center">
        <Button asChild size="lg" className="cursor-pointer">
          <Link href="/permissions">
            <Shield className="mr-2 h-4 w-4" />
            Gérer les permissions
          </Link>
        </Button>
      </div>
    </div>
  );
}
