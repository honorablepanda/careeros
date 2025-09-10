'use client';

import * as React from 'react';
import { trpc } from '@/trpc';

type Props = { userId: string };

export default function AddApplicationForm({ userId }: Props) {
  const utils = trpc.useUtils();
  const [company, setCompany] = React.useState('');
  const [role, setRole] = React.useState('');
  const [source, setSource] = React.useState<'JOB_BOARD'|'REFERRAL'|'COMPANY_WEBSITE'|'RECRUITER'|'OTHER'>('JOB_BOARD');

  const { mutateAsync, isLoading } = trpc.tracker.createApplication.useMutation({
    onSuccess: async () => {
      await utils.tracker.getApplications.invalidate({ userId });
      setCompany(''); setRole('');
    },
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!company || !role) return;
    await mutateAsync({ userId, company, role, status: 'APPLIED', source });
  }

  return (
    <form onSubmit={onSubmit} style={{ display:'grid', gap:8, marginBottom:16 }}>
      <input
        placeholder="Company"
        value={company}
        onChange={e=>setCompany(e.target.value)}
      />
      <input
        placeholder="Role"
        value={role}
        onChange={e=>setRole(e.target.value)}
      />
      <select value={source} onChange={e=>setSource(e.target.value as any)}>
        <option>JOB_BOARD</option>
        <option>REFERRAL</option>
        <option>COMPANY_WEBSITE</option>
        <option>RECRUITER</option>
        <option>OTHER</option>
      </select>
      <button type="submit" disabled={isLoading}>
        {isLoading ? 'Adding…' : 'Add Application'}
      </button>
    </form>
  );
}
