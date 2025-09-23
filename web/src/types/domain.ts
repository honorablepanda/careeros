export const APPLICATION_SOURCES = [
  'JOB_BOARD',
  'REFERRAL',
  'COMPANY_WEBSITE',
  'RECRUITER',
  'OTHER',
] as const;
export type ApplicationSource = (typeof APPLICATION_SOURCES)[number];
