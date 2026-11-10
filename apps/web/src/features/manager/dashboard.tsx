"use client";

import OperationalDashboard, { type OperationalStats } from "@/features/dashboard/operational-dashboard";

export default function ManagerDashboardClient({ stats }: { stats: OperationalStats }) {
  return <OperationalDashboard stats={stats} variant="manager" />;
}
