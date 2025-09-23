/* Phase 3: Tracker shared types */
export enum ApplicationStatus {
  APPLIED = 'APPLIED',
  INTERVIEWING = 'INTERVIEWING',
  OFFER = 'OFFER',
  REJECTED = 'REJECTED',
}

export type ApplicationItem = {
  id: string;
  userId: string;
  company: string;
  role: string;
  status: ApplicationStatus | string;
  appliedAt?: string | Date;
  notes?: string;
  tags?: string[];
  deadline?: string | Date;
  link?: string;
  resumeVersion?: string;
};

export type GetApplicationsInput = {
  userId?: string;
  status?: ApplicationStatus | string;
  limit?: number;
};
