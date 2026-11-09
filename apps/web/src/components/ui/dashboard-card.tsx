'use client';

import { memo, type ElementType } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface DashboardCardProps {
  stat: {
    title: string;
    value: string;
    change: string;
    changeType: 'positive' | 'negative';
    icon: ElementType;
    color: string;
    bgColor: string;
  };
  index: number;
}

export const DashboardCard = memo(({ stat, index }: DashboardCardProps) => {
  const Icon = stat.icon;
  const TrendIcon = stat.changeType === 'positive' ? TrendingUp : TrendingDown;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.3 }}
      className="group"
    >
      <div className="bg-card border border-border/60 rounded-xl p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:border-border">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              {stat.title}
            </p>
            <p className="text-3xl font-bold tabular-nums text-foreground">
              {stat.value}
            </p>
          </div>
          <div className={`rounded-xl p-2.5 shrink-0 ${stat.bgColor}`}>
            <Icon className={`h-5 w-5 ${stat.color}`} />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className={`flex items-center gap-1 text-xs font-medium ${
            stat.changeType === 'positive' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
          }`}>
            <TrendIcon className="h-3.5 w-3.5" />
            <span>{stat.change}</span>
          </div>
          <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${60 + index * 10}%` }}
              transition={{ duration: 0.8, delay: index * 0.1 }}
              className={`h-full rounded-full ${stat.color.replace('text-', 'bg-')} opacity-70`}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
});

DashboardCard.displayName = 'DashboardCard';
