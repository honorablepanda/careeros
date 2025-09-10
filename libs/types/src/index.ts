/**
 * Shared type used by the tracker UI.
 * Dates may be strings (JSON) or Date instances (SSR).
 */
export type ApplicationItem = {
  id: string;
  userId: string;
  company: string;
  role: string;
  status: string;
  notes?: string | null;
  location?: string | null;
  source?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};
