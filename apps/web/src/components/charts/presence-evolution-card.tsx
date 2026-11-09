"use client"

import { TrendingUp } from "lucide-react"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

type PresencePoint = {
  date: number
  presence: number
}

const chartConfig = {
  presence: {
    label: "Présences",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

export function PresenceEvolutionCard({
  data,
}: {
  data: PresencePoint[]
}) {
  const first = data[0]?.presence ?? 0
  const last = data[data.length - 1]?.presence ?? 0

  const trendPct = first > 0 ? ((last - first) / first) * 100 : 0
  const trendLabel = `${trendPct >= 0 ? "+" : ""}${trendPct.toFixed(1)}%`

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Évolution des présences
        </CardTitle>
        <CardDescription>
          Nombre d&apos;employés présents sur les 30 derniers jours
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-64 w-full">
          <AreaChart
            accessibilityLayer
            data={data}
            margin={{
              left: 12,
              right: 12,
            }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              interval="preserveStartEnd"
              tickFormatter={(value) => `${value}`}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="line" />}
            />
            <Area
              dataKey="presence"
              type="natural"
              fill="var(--color-presence)"
              fillOpacity={0.35}
              stroke="var(--color-presence)"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
      <CardFooter>
        <div className="flex w-full items-start gap-2 text-sm">
          <div className="grid gap-2">
            <div className="flex items-center gap-2 leading-none font-medium">
              Variation sur 30 jours: {trendLabel} <TrendingUp className="h-4 w-4" />
            </div>
            <div className="text-muted-foreground flex items-center gap-2 leading-none">
              Jours 1 - {data.length}
            </div>
          </div>
        </div>
      </CardFooter>
    </Card>
  )
}
