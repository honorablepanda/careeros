export function getUserId(): string {
  // Replace with real auth later; for now allow override via localStorage.
  if (typeof window === 'undefined') return 'demo-user';
  return window.localStorage.getItem('demoUserId') || 'demo-user';
}
