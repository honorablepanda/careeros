// Shared tracker types
import { z } from 'zod';

export const ApplicationStatus = z.enum([
  'APPLIED',
  'INTERVIEWING',
  'OFFER',
  'REJECTED',
]);
export type ApplicationStatus = z.infer<typeof ApplicationStatus>;

export const ApplicationItem = z.object({
  id: z.string(),
  title: z.string(),
  company: z.string(),
  status: ApplicationStatus,
  url: z.string().optional(),
  tags: z.array(z.string()).default([]),
  deadline: z.string().datetime().optional(),
  notes: z.string().optional(),
  resumeVersion: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  userId: z.string(),
});
export type ApplicationItem = z.infer<typeof ApplicationItem>;

export const CreateApplicationInput = ApplicationItem.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type CreateApplicationInput = z.infer<typeof CreateApplicationInput>;

export const UpdateApplicationInput = ApplicationItem.partial().extend({
  id: z.string(),
});
export type UpdateApplicationInput = z.infer<typeof UpdateApplicationInput>;
