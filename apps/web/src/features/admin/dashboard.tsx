"use client";

import OperationalDashboard, { type OperationalStats } from "@/features/dashboard/operational-dashboard";

export default function AdminDashboardClient({ stats }: { stats: OperationalStats }) {
  return <OperationalDashboard stats={stats} variant="admin" />;
}
