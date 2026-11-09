import DynamicLayout from '../dynamic-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle } from 'lucide-react';

export default function TestPermissionsPage() {
  return (
    <DynamicLayout>
      <div className="space-y-6">
        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight">Test des permissions</h1>
          <p className="text-sm text-muted-foreground">
            Cette page démontre comment la sidebar s&apos;adapte aux permissions de l&apos;utilisateur.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                Comment ça fonctionne
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline">1</Badge>
                <span>L&apos;utilisateur se connecte</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">2</Badge>
                <span>Ses permissions sont chargées</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">3</Badge>
                <span>La sidebar s&apos;adapte automatiquement</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">4</Badge>
                <span>Seuls les liens autorisés apparaissent</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-red-600" />
                Exemples concrets
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="p-3 rounded-lg border">
                <h4 className="font-medium mb-2">Employé standard</h4>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>• Dashboard</li>
                  <li>• Mes pointages</li>
                  <li>• Profil</li>
                </ul>
              </div>
              
              <div className="p-3 rounded-lg border">
                <h4 className="font-medium mb-2">Employé avec permission &quot;rapports&quot;</h4>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>• Dashboard</li>
                  <li>• Mes pointages</li>
                  <li>• <span className="text-green-600 font-medium">Rapports</span> ✓</li>
                  <li>• Profil</li>
                </ul>
              </div>
              
              <div className="p-3 rounded-lg border">
                <h4 className="font-medium mb-2">Manager</h4>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>• Dashboard</li>
                  <li>• Mes pointages</li>
                  <li>• <span className="text-green-600 font-medium">Employés</span> ✓</li>
                  <li>• <span className="text-green-600 font-medium">Pointages équipe</span> ✓</li>
                  <li>• <span className="text-green-600 font-medium">Validations</span> ✓</li>
                  <li>• Profil</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Instructions de test</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ol className="text-sm space-y-2 list-decimal list-inside">
              <li>
                Connectez-vous en tant qu&apos;admin
              </li>
              <li>
                Attribuez des permissions spécifiques à un utilisateur (ex: <code>reports.view_team</code>)
              </li>
              <li>
                Connectez-vous avec cet utilisateur
              </li>
              <li>
                Observez que les liens apparaissent/disparaissent dans la sidebar
              </li>
            </ol>
            
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Note :</strong> Les admins voient toujours tous les liens, 
                mais les autres utilisateurs ne voient que les liens pour lesquels 
                ils ont les permissions requises.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DynamicLayout>
  );
}
