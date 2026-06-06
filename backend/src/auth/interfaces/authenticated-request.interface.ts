import type { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string | null;
  firstname: string | null;
  lastname: string | null;
  role: string;
  department: string | null;
  position: string | null;
  status: string;
  isLocal: boolean;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
  sessionToken: string;
}
