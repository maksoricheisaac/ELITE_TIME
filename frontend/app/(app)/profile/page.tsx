export const dynamic = 'force-dynamic';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { User, Mail, Briefcase, Building } from 'lucide-react';
import { redirect } from 'next/navigation';
import { serverGet } from '@/lib/server-api';
import type { User as UserType } from '@/types/models';
import ProfileUpdateNotifier from '@/features/employee/profile-update-notifier';
import { requireNavigationAccessByPath } from '@/lib/navigation-guard';
import { changeLocalPasswordAction } from '@/actions/employee/profile';

export default async function AppEmployeeProfile() {
  // Page profil = accessible à tout utilisateur authentifié
  try {
    await requireNavigationAccessByPath('/profile');
  } catch {
    redirect('/login');
  }

  let user: UserType;
  try {
    const data = await serverGet<{ user: UserType }>('/auth/me');
    user = data.user;
  } catch {
    redirect('/login');
  }

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="space-y-6">
      <ProfileUpdateNotifier />
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Mon profil</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Consultez vos informations personnelles (lecture seule)</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Informations personnelles</CardTitle>
            <CardDescription>Vos informations sont gérées par l&apos;administrateur</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Prénom</p>
                <p className="text-sm font-medium">{user.firstname || 'Non renseigné'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Nom</p>
                <p className="text-sm font-medium">{user.lastname || 'Non renseigné'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informations professionnelles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Email</p>
              <p className="text-sm text-muted-foreground">{user.email  || 'Non renseigné'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Briefcase className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Poste</p>
              <p className="text-sm text-muted-foreground">{user.position || 'Non renseigné'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Building className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Service</p>
              <p className="text-sm text-muted-foreground">{user.department || 'Non renseigné'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <User className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Rôle</p>
              <p className="text-sm text-muted-foreground capitalize">{user.role}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {user.isLocal && (
        <Card>
          <CardHeader>
            <CardTitle>Changer le mot de passe</CardTitle>
            <CardDescription>Disponible uniquement pour les comptes locaux</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form action={changeLocalPasswordAction} className="space-y-4">
              <input type="hidden" name="redirectTo" value="/profile" />
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Mot de passe actuel</p>
                <input
                  name="currentPassword"
                  type="password"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  autoComplete="current-password"
                  required
                />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Nouveau mot de passe</p>
                  <input
                    name="newPassword"
                    type="password"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    autoComplete="new-password"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Confirmer</p>
                  <input
                    name="confirmPassword"
                    type="password"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    autoComplete="new-password"
                    required
                  />
                </div>
              </div>
              <button
                type="submit"
                className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
              >
                Mettre à jour le mot de passe
              </button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
