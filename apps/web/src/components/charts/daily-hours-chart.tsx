'use client';

import { Bar, BarChart, Cell, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export type DayKind = 'normal' | 'late' | 'incomplete';

export interface DailyHoursPoint {
  /** Libellé court de l'axe (ex. « 12 nov. ») */
  label: string;
  hours: number;
  kind: DayKind;
}

const COLOR: Record<DayKind, string> = {
  normal: 'var(--chart-1)',
  late: 'var(--chart-3)',
  incomplete: 'var(--danger)',
};
const KIND_LABEL: Record<DayKind, string> = {
  normal: 'À l’heure',
  late: 'Retard',
  incomplete: 'Incomplet',
};

/** Heures travaillées par jour ; la couleur indique l'état du jour (la légende le précise aussi en texte). */
export function DailyHoursChart({
  data,
  title,
  description,
}: {
  data: DailyHoursPoint[];
  title: string;
  description?: string;
}) {
  return (
    <Card className="gap-3 py-4 shadow-none">
      <CardHeader className="px-4">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
      </CardHeader>
      <CardContent className="px-2 sm:px-4">
        {data.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Aucun pointage sur cette période.</p>
        ) : (
          <>
            <div role="img" aria-label={`${title} : heures travaillées par jour`} className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    minTickGap={16}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    tickLine={false}
                    axisLine={false}
                    width={36}
                    unit="h"
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--accent)' }}
                    content={({ active, payload }) =>
                      active && payload?.length ? (
                        <div className="rounded-lg border border-border bg-popover p-2.5 text-xs shadow-[var(--shadow-popover)]">
                          <p className="mb-1 font-medium">{payload[0].payload.label}</p>
                          <p className="tabular text-muted-foreground">
                            Travail : <span className="font-semibold text-foreground">{payload[0].payload.hours} h</span>
                          </p>
                          <p className="text-muted-foreground">{KIND_LABEL[payload[0].payload.kind as DayKind]}</p>
                        </div>
                      ) : null
                    }
                  />
                  <Bar dataKey="hours" radius={[3, 3, 0, 0]} maxBarSize={28}>
                    {data.map((d, i) => (
                      <Cell key={i} fill={COLOR[d.kind]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-2 text-xs text-muted-foreground">
              {(Object.keys(KIND_LABEL) as DayKind[]).map((k) => (
                <li key={k} className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm" style={{ background: COLOR[k] }} aria-hidden="true" />
                  {KIND_LABEL[k]}
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
