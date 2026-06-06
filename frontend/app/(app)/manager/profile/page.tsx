import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { User, Mail, Briefcase, Building, Users, Check } from 'lucide-react';
import { redirect } from 'next/navigation';
import { serverGet } from '@/lib/server-api';
import type { User as UserType } from '@/types/models';
import { updateEmployeeProfileAction } from '@/actions/employee/profile';
import { changeLocalPasswordAction } from '@/actions/employee/profile';
import { getAuthenticatedUser } from '@/lib/security/rbac';

export default async function AppManagerProfile() {
  let user: UserType;
  try {
    // Page profil = accessible à tout utilisateur authentifié
    await getAuthenticatedUser();
    const data = await serverGet<{ user: UserType }>('/auth/me');
    user = data.user;
  } catch {
    redirect('/login');
  }

  if (!user!) redirect('/login');

  // Récupérer les informations de l'équipe
  const { users: teamRaw } = await serverGet<{ users: UserType[]; total: number }>(
    '/users?role=employee&status=active&limit=5'
  );
  const sortedTeam = [...teamRaw].sort((a, b) => (a.firstname ?? '').localeCompare(b.firstname ?? ''));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Mon profil</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gérez vos informations personnelles et votre équipe</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader><CardTitle>Avatar</CardTitle></CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <Avatar className="h-32 w-32 text-6xl">
              <AvatarFallback className="bg-primary text-white">{user!.avatar}</AvatarFallback>
            </Avatar>
            <p className="text-center text-sm text-muted-foreground">
              Votre avatar est généré automatiquement
            </p>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Informations personnelles</CardTitle>
            <CardDescription>Modifiez vos informations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form action={updateEmployeeProfileAction} className="space-y-4">
              <input type="hidden" name="userId" value={user!.id} />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstname">Prénom</Label>
                  <Input id="firstname" name="firstname" defaultValue={user!.firstname ?? ''} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastname">Nom</Label>
                  <Input id="lastname" name="lastname" defaultValue={user!.lastname ?? ''} />
                </div>
              </div>
              <Button type="submit" className="inline-flex items-center gap-2 cursor-pointer">
                <Check className="h-4 w-4" />
                <span>Enregistrer les modifications</span>
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Informations professionnelles</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Email</p>
              <p className="text-sm text-muted-foreground">{user!.email || 'Non renseigné'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Briefcase className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Poste</p>
              <p className="text-sm text-muted-foreground">{user!.position || 'Non renseigné'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Building className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Service</p>
              <p className="text-sm text-muted-foreground">{user!.department || 'Non renseigné'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <User className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Rôle</p>
              <p className="text-sm text-muted-foreground capitalize">{user!.role}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {user!.isLocal && (
        <Card>
          <CardHeader>
            <CardTitle>Changer le mot de passe</CardTitle>
            <CardDescription>Disponible uniquement pour les comptes locaux</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form action={changeLocalPasswordAction} className="space-y-4">
              <input type="hidden" name="redirectTo" value="/manager/profile" />
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Mot de passe actuel</Label>
                <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">Nouveau mot de passe</Label>
                  <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirmer</Label>
                  <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
                </div>
              </div>
              <Button type="submit" className="cursor-pointer">Mettre à jour le mot de passe</Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Vue d&apos;ensemble de l&apos;équipe
          </CardTitle>
          <CardDescription>
            Les {sortedTeam.length} premiers membres de votre équipe
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sortedTeam.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun employé dans votre équipe</p>
          ) : (
            <div className="space-y-2">
              {sortedTeam.map((employee) => (
                <div key={employee.id} className="flex items-center justify-between p-2 rounded-lg border">
                  <div>
                    <p className="text-sm font-medium">{employee.firstname} {employee.lastname}</p>
                    <p className="text-xs text-muted-foreground">{employee.position}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">{employee.department}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
