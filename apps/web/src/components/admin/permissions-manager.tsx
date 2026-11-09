'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, Shield, User } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useNotification } from '@/contexts/notification-context';

interface Permission {
  id: string;
  name: string;
  description: string | null;
  category: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface User {
  id: string;
  username: string;
  email: string | null;
  firstname: string | null;
  lastname: string | null;
  role: string;
  userPermissions: Array<{
    id: string;
    permissionId: string;
    permission: Permission;
  }>;
}

interface PermissionsManagerProps {
  users: User[];
  permissions: Permission[];
}

export function PermissionsManager({ users, permissions }: PermissionsManagerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [{ userId: pendingUserId, pendingAdd, pendingRemove }, setPending] = useState<{
    userId: string | null;
    pendingAdd: Set<string>;
    pendingRemove: Set<string>;
  }>({ userId: null, pendingAdd: new Set(), pendingRemove: new Set() });

  // Reset pending changes when selected user changes (computed, not via effect)
  const effectivePendingAdd = useMemo(
    () => pendingUserId === (selectedUser?.id ?? null) ? pendingAdd : new Set<string>(),
    [pendingUserId, selectedUser, pendingAdd],
  );
  const effectivePendingRemove = useMemo(
    () => pendingUserId === (selectedUser?.id ?? null) ? pendingRemove : new Set<string>(),
    [pendingUserId, selectedUser, pendingRemove],
  );
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const { showSuccess, showError } = useNotification();
  const categories = Array.from(new Set(permissions.map(p => p.category))).sort();

  const filteredUsers = users.filter(user =>
    user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    `${user.firstname} ${user.lastname}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredPermissions = permissions.filter(permission =>
    selectedCategory === 'all' || permission.category === selectedCategory
  );

  const userPermissionIds = useMemo(() => {
    if (!selectedUser) return [];
    return selectedUser.userPermissions.map((up) => up.permissionId);
  }, [selectedUser]);

  const userPermissionIdsSet = useMemo(
    () => new Set(userPermissionIds),
    [userPermissionIds],
  );

  // Derived: current selection = (base permissions + effectivePendingAdd) - effectivePendingRemove
  const selectedPermissionIds = useMemo(() => {
    const result = new Set(userPermissionIds);
    for (const id of effectivePendingAdd) result.add(id);
    for (const id of effectivePendingRemove) result.delete(id);
    return result;
  }, [userPermissionIds, effectivePendingAdd, effectivePendingRemove]);

  const isDirty = useMemo(() => {
    if (!selectedUser) return false;
    return effectivePendingAdd.size > 0 || effectivePendingRemove.size > 0;
  }, [selectedUser, effectivePendingAdd, effectivePendingRemove]);

  const handlePermissionToggle = (permissionId: string, isChecked: boolean) => {
    const uid = selectedUser?.id ?? null;
    if (isChecked) {
      setPending(({ pendingAdd: pa, pendingRemove: pr }) => {
        const nextAdd = new Set(pa); nextAdd.add(permissionId);
        const nextRemove = new Set(pr); nextRemove.delete(permissionId);
        return { userId: uid, pendingAdd: nextAdd, pendingRemove: nextRemove };
      });
    } else {
      setPending(({ pendingAdd: pa, pendingRemove: pr }) => {
        const nextRemove = new Set(pr); nextRemove.add(permissionId);
        const nextAdd = new Set(pa); nextAdd.delete(permissionId);
        return { userId: uid, pendingAdd: nextAdd, pendingRemove: nextRemove };
      });
    }
  };

  const handleCategoryToggle = (categoryPermissions: Permission[], isChecked: boolean) => {
    const uid = selectedUser?.id ?? null;
    const ids = categoryPermissions.map((p) => p.id);
    if (isChecked) {
      setPending(({ pendingAdd: pa, pendingRemove: pr }) => {
        const nextAdd = new Set(pa);
        const nextRemove = new Set(pr);
        for (const id of ids) {
          nextAdd.add(id);
          nextRemove.delete(id);
        }
        return { userId: uid, pendingAdd: nextAdd, pendingRemove: nextRemove };
      });
    } else {
      setPending(({ pendingAdd: pa, pendingRemove: pr }) => {
        const nextAdd = new Set(pa);
        const nextRemove = new Set(pr);
        for (const id of ids) {
          nextRemove.add(id);
          nextAdd.delete(id);
        }
        return { userId: uid, pendingAdd: nextAdd, pendingRemove: nextRemove };
      });
    }
  };

  const applyChanges = async () => {
    if (!selectedUser) return;

    const toAdd: string[] = [];
    const toRemove: string[] = [];

    for (const id of selectedPermissionIds) {
      if (!userPermissionIdsSet.has(id)) toAdd.push(id);
    }
    for (const id of userPermissionIdsSet) {
      if (!selectedPermissionIds.has(id)) toRemove.push(id);
    }

    if (toAdd.length === 0 && toRemove.length === 0) return;

    setIsLoading(true);
    try {
      const requests = [
        ...toAdd.map((permissionId) =>
          fetch(`/api/admin/users/${selectedUser.id}/permissions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ permissionId }),
          }),
        ),
        ...toRemove.map((permissionId) =>
          fetch(`/api/admin/users/${selectedUser.id}/permissions`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ permissionId }),
          }),
        ),
      ];

      const results = await Promise.all(requests);

      const firstError = results.find((r) => !r.ok);
      if (firstError) {
        const errorData = await firstError.json().catch(() => ({}));
        const errorMessage = errorData.error || 'Erreur lors de la mise à jour des permissions';
        throw new Error(errorMessage);
      }

      showSuccess('Permissions mises à jour avec succès');

      // Recharger les permissions globalement pour mettre à jour la sidebar si nécessaire
      if ((window as unknown as { refetchPermissions?: () => Promise<void> }).refetchPermissions) {
        await (window as unknown as { refetchPermissions: () => Promise<void> }).refetchPermissions();
      }

      // Refresh the page to show updated permissions
      window.location.reload();
    } catch (error) {
      console.error('Error updating permissions:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la mise à jour des permissions';
      showError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetToRoleDefaults = async () => {
    if (!selectedUser) return;

    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/admin/users/${selectedUser.id}/permissions/reset`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message = data.error || "Erreur lors de la réinitialisation des permissions";
        throw new Error(message);
      }

      showSuccess('Permissions réinitialisées selon le rôle');

      // Recharger pour refléter le nouvel état des permissions
      window.location.reload();
    } catch (error) {
      console.error('Error resetting permissions:', error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Erreur lors de la réinitialisation des permissions';
      showError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const groupedPermissions = filteredPermissions.reduce((acc, permission) => {
    if (!acc[permission.category]) {
      acc[permission.category] = [];
    }
    acc[permission.category].push(permission);
    return acc;
  }, {} as Record<string, Permission[]>);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Liste des utilisateurs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Utilisateurs
          </CardTitle>
          <CardDescription>
            Sélectionnez un utilisateur pour gérer ses permissions
          </CardDescription>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un utilisateur..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filteredUsers.map((user) => (
              <div
                key={user.id}
                className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50 ${
                  selectedUser?.id === user.id ? 'bg-muted border-primary' : ''
                }`}
                onClick={() => setSelectedUser(user)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-xs font-medium">
                      {user.firstname?.[0] || user.username[0]}
                    </span>
                  </div>
                  <div>
                    <div className="font-medium">
                      {user.firstname && user.lastname 
                        ? `${user.firstname} ${user.lastname}`
                        : user.username
                      }
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {user.email || user.username}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                    {user.role}
                  </Badge>
                  <Badge variant="outline">
                    {user.userPermissions.length} permissions
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Gestion des permissions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Permissions
          </CardTitle>
          <CardDescription>
            {selectedUser 
              ? `Gérer les permissions de ${selectedUser.firstname && selectedUser.lastname 
                  ? `${selectedUser.firstname} ${selectedUser.lastname}`
                  : selectedUser.username
                }`
              : 'Sélectionnez un utilisateur pour gérer ses permissions'
            }
          </CardDescription>
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="category-filter" className="shrink-0">Catégorie:</Label>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger id="category-filter" className="flex-1 min-w-[140px]">
                <SelectValue placeholder="Filtrer par catégorie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les catégories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {!selectedUser ? (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Sélectionnez un utilisateur pour voir et modifier ses permissions</p>
            </div>
          ) : (
            <div className="space-y-6 max-h-96 overflow-y-auto">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm text-muted-foreground">
                  {selectedPermissionIds.size} sélectionnée(s)
                </div>
                <div className="flex items-center gap-2">
                  <AlertDialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={() => setIsResetDialogOpen(true)}
                      disabled={isLoading || selectedUser.role === 'admin'}
                      className="cursor-pointer"
                    >
                      Réinitialiser selon le rôle
                    </Button>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Réinitialiser les permissions ?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Cette action va supprimer toutes les permissions explicites de cet utilisateur
                          et les réinitialiser selon son rôle. Cette opération est utile pour corriger
                          une configuration de permissions incohérente.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={(e) => {
                            e.preventDefault();
                            setIsResetDialogOpen(false);
                            void handleResetToRoleDefaults();
                          }}
                        >
                          Confirmer la réinitialisation
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPending({ userId: selectedUser?.id ?? null, pendingAdd: new Set(), pendingRemove: new Set() })}
                    disabled={isLoading || selectedUser.role === 'admin' || !isDirty}
                    className="cursor-pointer"
                  >
                    Réinitialiser
                  </Button>
                  <Button
                    size="sm"
                    onClick={applyChanges}
                    disabled={isLoading || selectedUser.role === 'admin' || !isDirty}
                    className="cursor-pointer"
                  >
                    Enregistrer
                  </Button>
                </div>
              </div>

              {Object.entries(groupedPermissions).map(([category, categoryPermissions]) => {
                const categoryIds = categoryPermissions.map((p) => p.id);
                const selectedCount = categoryIds.filter((id) => selectedPermissionIds.has(id)).length;
                const allSelected = selectedCount === categoryIds.length;
                const someSelected = selectedCount > 0 && !allSelected;

                return (
                <div key={category} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`category-${category}`}
                      checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                      onCheckedChange={(checked) =>
                        handleCategoryToggle(categoryPermissions, checked === true)
                      }
                      disabled={isLoading || selectedUser.role === 'admin'}
                    />
                    <Label
                      htmlFor={`category-${category}`}
                      className="font-medium text-sm text-muted-foreground uppercase tracking-wide cursor-pointer"
                    >
                      {category}
                    </Label>
                    <span className="text-xs text-muted-foreground">
                      ({selectedCount}/{categoryIds.length})
                    </span>
                  </div>
                  <div className="space-y-2">
                    {categoryPermissions.map((permission) => (
                      <div
                        key={permission.id}
                        className="flex items-center justify-between p-3 rounded-lg border"
                      >
                        <div className="flex items-center gap-3">
                          <Checkbox
                            id={permission.id}
                            checked={selectedPermissionIds.has(permission.id)}
                            onCheckedChange={(checked) =>
                              handlePermissionToggle(permission.id, checked as boolean)
                            }
                            disabled={isLoading || selectedUser.role === 'admin'}
                          />
                          <div>
                            <Label htmlFor={permission.id} className="font-medium cursor-pointer">
                              {permission.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </Label>
                            {permission.description && (
                              <p className="text-sm text-muted-foreground">
                                {permission.description}
                              </p>
                            )}
                          </div>
                        </div>
                        {selectedPermissionIds.has(permission.id) && (
                          <Badge variant="default" className="text-xs">
                            Actif
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
