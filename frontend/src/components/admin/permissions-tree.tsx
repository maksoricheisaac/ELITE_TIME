'use client';

import { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Search, ChevronDown, ChevronRight, Shield, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

type PermissionRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

interface Permission {
  id: string;
  name: string;
  description: string | null;
  category: string;
  module: string | null;
  action: string | null;
  riskLevel: PermissionRisk;
  isSystem: boolean;
}

interface PermissionsTreeProps {
  permissions: Permission[];
}

const RISK_CONFIG: Record<PermissionRisk, { label: string; color: string; bg: string; icon: typeof Shield }> = {
  LOW:      { label: 'Faible',   color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800', icon: Shield },
  MEDIUM:   { label: 'Moyen',    color: 'text-blue-700 dark:text-blue-400',       bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',             icon: Shield },
  HIGH:     { label: 'Élevé',    color: 'text-orange-700 dark:text-orange-400',   bg: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800',     icon: AlertTriangle },
  CRITICAL: { label: 'Critique', color: 'text-red-700 dark:text-red-400',         bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',                 icon: Shield },
};

const RISK_LEVELS: PermissionRisk[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export function PermissionsTree({ permissions }: PermissionsTreeProps) {
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<PermissionRisk | 'ALL'>('ALL');
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  // Grouper par module
  const groupedByModule = useMemo(() => {
    const filtered = permissions.filter((p) => {
      const matchSearch = !search || p.name.includes(search) || (p.description ?? '').toLowerCase().includes(search.toLowerCase());
      const matchRisk = riskFilter === 'ALL' || p.riskLevel === riskFilter;
      return matchSearch && matchRisk;
    });

    const map = new Map<string, Permission[]>();
    for (const p of filtered) {
      const mod = p.module ?? p.category ?? 'other';
      if (!map.has(mod)) map.set(mod, []);
      map.get(mod)!.push(p);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [permissions, search, riskFilter]);

  const toggleModule = (mod: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(mod)) next.delete(mod);
      else next.add(mod);
      return next;
    });
  };

  const expandAll = () => setExpandedModules(new Set(groupedByModule.map(([mod]) => mod)));
  const collapseAll = () => setExpandedModules(new Set());

  const totalFiltered = groupedByModule.reduce((sum, [, perms]) => sum + perms.length, 0);

  return (
    <div className="space-y-4">
      {/* Barre de filtres */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher une permission..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Risque :</span>
          {(['ALL', ...RISK_LEVELS] as const).map((level) => (
            <button
              key={level}
              onClick={() => setRiskFilter(level)}
              className={cn(
                'px-2.5 py-1 rounded-full text-xs font-medium transition-colors border',
                riskFilter === level
                  ? level === 'ALL'
                    ? 'bg-foreground text-background border-foreground'
                    : cn(RISK_CONFIG[level].bg, RISK_CONFIG[level].color, 'border')
                  : 'bg-background text-muted-foreground border-border hover:bg-muted'
              )}
            >
              {level === 'ALL' ? 'Tous' : RISK_CONFIG[level].label}
            </button>
          ))}
        </div>
      </div>

      {/* Contrôles expand/collapse + compteur */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {totalFiltered} permission{totalFiltered !== 1 ? 's' : ''} — {groupedByModule.length} module{groupedByModule.length !== 1 ? 's' : ''}
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={expandAll}>Tout déplier</Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={collapseAll}>Tout replier</Button>
        </div>
      </div>

      {/* Arbre des modules */}
      <div className="space-y-2">
        {groupedByModule.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">Aucune permission trouvée</p>
        ) : (
          groupedByModule.map(([mod, perms]) => {
            const isExpanded = expandedModules.has(mod);
            const riskCounts = perms.reduce<Record<PermissionRisk, number>>(
              (acc, p) => { acc[p.riskLevel] = (acc[p.riskLevel] ?? 0) + 1; return acc; },
              { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 }
            );

            return (
              <Card key={mod} className="border-border/50 overflow-hidden">
                <button
                  onClick={() => toggleModule(mod)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                >
                  {isExpanded
                    ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  }
                  <span className="font-mono font-semibold text-sm text-primary">{mod}</span>
                  <span className="text-xs text-muted-foreground">({perms.length})</span>
                  <div className="ml-auto flex gap-1">
                    {(Object.entries(riskCounts) as [PermissionRisk, number][])
                      .filter(([, count]) => count > 0)
                      .map(([risk, count]) => {
                        const cfg = RISK_CONFIG[risk];
                        return (
                          <span key={risk} className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium border', cfg.bg, cfg.color)}>
                            {count}
                          </span>
                        );
                      })}
                  </div>
                </button>

                {isExpanded && (
                  <CardContent className="pt-0 px-4 pb-3">
                    <div className="border-t border-border/40 pt-3 grid gap-1.5 sm:grid-cols-2">
                      {perms.map((p) => {
                        const cfg = RISK_CONFIG[p.riskLevel];
                        const RiskIcon = cfg.icon;
                        return (
                          <div
                            key={p.id}
                            className={cn(
                              'flex items-start gap-2.5 rounded-lg border px-3 py-2',
                              cfg.bg
                            )}
                          >
                            <RiskIcon className={cn('h-3.5 w-3.5 mt-0.5 shrink-0', cfg.color)} />
                            <div className="min-w-0 flex-1">
                              <p className={cn('font-mono text-xs font-semibold', cfg.color)}>
                                {p.action ?? p.name}
                              </p>
                              {p.description && (
                                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                                  {p.description}
                                </p>
                              )}
                            </div>
                            <Badge variant="outline" className={cn('text-[9px] border shrink-0', cfg.color, 'border-current/30')}>
                              {cfg.label}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })
        )}
      </div>

      {/* Légende */}
      <div className="flex flex-wrap gap-3 pt-2">
        {RISK_LEVELS.map((level) => {
          const cfg = RISK_CONFIG[level];
          const RiskIcon = cfg.icon;
          return (
            <div key={level} className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs', cfg.bg, cfg.color)}>
              <RiskIcon className="h-3 w-3" />
              <span className="font-medium">{cfg.label}</span>
              <span className="opacity-60">— {permissions.filter(p => p.riskLevel === level).length}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
