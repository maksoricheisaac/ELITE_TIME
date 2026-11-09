import { Badge } from '@/components/ui/badge';
import { Shield, Key } from 'lucide-react';
import { getUserPermissions } from '@/lib/security/rbac';

interface PermissionBadgeProps {
  userId: string;
  userRole: string;
  variant?: 'default' | 'compact';
}

export async function PermissionBadge({ userId, userRole, variant = 'default' }: PermissionBadgeProps) {
  if (userRole === 'admin') {
    return (
      <Badge variant="default" className="bg-red-500">
        <Shield className="w-3 h-3 mr-1" />
        Admin
      </Badge>
    );
  }

  let permissionNames: string[] = [];

  try {
    permissionNames = await getUserPermissions(userId);
  } catch {
    return null;
  }

  if (permissionNames.length === 0) {
    if (userRole === 'manager') {
      if (variant === 'compact') {
        return (
          <Badge variant="secondary" className="bg-blue-100 text-blue-800">
            <Key className="w-3 h-3 mr-1" />
            Rôle manager
          </Badge>
        );
      }
      return (
        <Badge variant="outline" className="text-muted-foreground">
          Permissions via rôle manager
        </Badge>
      );
    }
    return variant === 'compact' ? null : (
      <Badge variant="outline" className="text-muted-foreground">
        Aucune permission
      </Badge>
    );
  }

  // Dériver les modules depuis le format module.action (ex: "absences.approve" → "absences")
  const modules = [...new Set(
    permissionNames.map((name) => {
      const dot = name.indexOf('.');
      return dot >= 0 ? name.slice(0, dot) : name;
    })
  )];

  if (variant === 'compact') {
    return (
      <Badge variant="secondary" className="bg-blue-100 text-blue-800">
        <Key className="w-3 h-3 mr-1" />
        {permissionNames.length}
      </Badge>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {modules.slice(0, 3).map((module) => (
        <Badge key={module} variant="secondary" className="text-xs">
          {module}
        </Badge>
      ))}
      {modules.length > 3 && (
        <Badge variant="outline" className="text-xs">
          +{modules.length - 3}
        </Badge>
      )}
    </div>
  );
}
