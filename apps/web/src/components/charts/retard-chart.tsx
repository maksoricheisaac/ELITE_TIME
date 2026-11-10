'use client';

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface RetardData {
  date: string;
  retards: number;
  moyenneRetard: number;
}

interface RetardChartProps {
  data: RetardData[];
  title?: string;
  description?: string;
}

const shortDate = (iso: string) => {
  const [, m, d] = iso.split('-');
  return d && m ? `${d}/${m}` : iso;
};

/**
 * Retards par jour en barres (ambre). Pas de courbe lissée : elle inventerait des
 * valeurs entre deux jours (design-system/MASTER.md §6, graphiques).
 */
export function RetardChart({
  data,
  title = 'Retards',
  description = 'Nombre de retards par jour',
}: RetardChartProps) {
  return (
    <Card className="gap-3 py-4 shadow-none">
      <CardHeader className="px-4">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent className="px-2 sm:px-4">
        {data.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Aucun retard enregistré sur cette période.
          </p>
        ) : (
          <>
            <div role="img" aria-label={`${title} : ${description}`} className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={shortDate}
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    minTickGap={16}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    tickLine={false}
                    axisLine={false}
                    width={36}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--accent)' }}
                    content={({ active, payload, label }) =>
                      active && payload?.length ? (
                        <div className="rounded-lg border border-border bg-popover p-2.5 text-xs shadow-[var(--shadow-popover)]">
                          <p className="mb-1 font-medium">{shortDate(String(label))}</p>
                          <p className="tabular text-muted-foreground">
                            Retards : <span className="font-semibold text-foreground">{payload[0].payload.retards}</span>
                          </p>
                          <p className="tabular text-muted-foreground">
                            Part des présents : <span className="font-semibold text-foreground">{payload[0].payload.moyenneRetard} %</span>
                          </p>
                        </div>
                      ) : null
                    }
                  />
                  <Bar dataKey="retards" fill="var(--chart-3)" radius={[3, 3, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <details className="mt-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none py-1 hover:text-foreground">
                Afficher les données en tableau
              </summary>
              <div className="max-h-48 overflow-auto">
                <table className="tabular w-full text-left">
                  <thead>
                    <tr>
                      <th className="py-1 pr-3 font-medium">Date</th>
                      <th className="py-1 pr-3 font-medium">Retards</th>
                      <th className="py-1 font-medium">Part des présents</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((d) => (
                      <tr key={d.date} className="border-t border-border">
                        <td className="py-1 pr-3">{shortDate(d.date)}</td>
                        <td className="py-1 pr-3">{d.retards}</td>
                        <td className="py-1">{d.moyenneRetard} %</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  );
}
