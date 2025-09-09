// shared\types\src\tracker.ts
export type ApplicationDTO = {
  id: string;
  userId: string;
  company: string;
  role: string;
  location?: string | null;
  status: 'APPLIED'|'INTERVIEW'|'OFFER'|'REJECTED'|'WITHDRAWN'|'HIRED';
  source: 'JOB_BOARD'|'REFERRAL'|'COMPANY_WEBSITE'|'RECRUITER'|'OTHER';
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
};
