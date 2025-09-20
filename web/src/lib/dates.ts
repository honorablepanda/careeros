export type Dateish = string | number | Date | null | undefined;

const toDate = (v: unknown): Date | null => {
  if (v == null) return null;
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? null : v;
  }
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};

export const dateValue = (v: unknown): number => {
  const d = toDate(v);
  return d ? d.getTime() : 0;
};

export const formatDate = (v: unknown): string => {
  const d = toDate(v);
  return d ? d.toLocaleDateString() : '—';
};

export const formatDateTime = (v: unknown): string => {
  const d = toDate(v);
  return d ? d.toLocaleString() : '—';
};
