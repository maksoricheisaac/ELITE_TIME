export interface ToolContext {
  userId: string;
  role: 'admin' | 'manager' | 'team_lead' | 'employee';
  department?: string | null;
}
