'use client';

import { Line, LineChart, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock } from 'lucide-react';

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

export function RetardChart({ data, title = "Retards du mois", description = "Nombre de retards par jour" }: RetardChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="pb-2">
        <ResponsiveContainer width="100%" height="100%" minHeight={200} aspect={2.5}>
          <LineChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={32}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload as RetardData;
                  return (
                    <div className="rounded-lg border bg-background p-2 shadow-sm">
                      <div className="space-y-1">
                        <div className="text-sm font-medium">{label}</div>
                        <div className="flex flex-col">
                          <span className="text-[0.70rem] uppercase text-muted-foreground">Retards</span>
                          <span className="font-bold text-orange-600">{data.retards}</span>
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Line 
              type="monotone" 
              dataKey="retards" 
              stroke="hsl(25, 95%, 53%)"
              strokeWidth={2}
              dot={{ 
                fill: "hsl(25, 95%, 53%)",
                r: 4,
                strokeWidth: 2,
              }}
              activeDot={{
                r: 6,
                style: { fill: "hsl(25, 95%, 53%)" },
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
