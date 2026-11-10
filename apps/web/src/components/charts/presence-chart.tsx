'use client';

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface PresenceData {
  date: string;
  presents: number;
  absents: number;
  total: number;
}

interface PresenceChartProps {
  data: PresenceData[];
  title?: string;
  description?: string;
}

const shortDate = (iso: string) => {
  const [, m, d] = iso.split('-');
  return d && m ? `${d}/${m}` : iso;
};

/** Présents (bleu marque) et absents (gris) par jour — design-system/MASTER.md §3.4 */
export function PresenceChart({
  data,
  title = 'Présences',
  description = "Nombre d'employés présents par jour",
}: PresenceChartProps) {
  return (
    <Card className="gap-3 py-4 shadow-none">
      <CardHeader className="px-4">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent className="px-2 sm:px-4">
        {data.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Aucune donnée de présence sur cette période.
          </p>
        ) : (
          <>
            <div role="img" aria-label={`${title} : ${description}`} className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barGap={2}>
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
                            Présents : <span className="font-semibold text-foreground">{payload[0].payload.presents}</span>
                          </p>
                          <p className="tabular text-muted-foreground">
                            Absents : <span className="font-semibold text-foreground">{payload[0].payload.absents}</span>
                          </p>
                        </div>
                      ) : null
                    }
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={28}
                    iconType="square"
                    iconSize={10}
                    formatter={(v) => (
                      <span className="text-xs text-muted-foreground">
                        {v === 'presents' ? 'Présents' : 'Absents'}
                      </span>
                    )}
                  />
                  <Bar dataKey="presents" fill="var(--chart-1)" radius={[3, 3, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="absents" fill="var(--chart-4)" fillOpacity={0.55} radius={[3, 3, 0, 0]} maxBarSize={28} />
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
                      <th className="py-1 pr-3 font-medium">Présents</th>
                      <th className="py-1 font-medium">Absents</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((d) => (
                      <tr key={d.date} className="border-t border-border">
                        <td className="py-1 pr-3">{shortDate(d.date)}</td>
                        <td className="py-1 pr-3">{d.presents}</td>
                        <td className="py-1">{d.absents}</td>
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
