import { describe, it, expect } from 'vitest';
describe('web sanity', () => {
  it('creates a div in happy-dom', () => {
    const el = document.createElement('div');
    expect(el).toBeInstanceOf(HTMLDivElement);
  });
});
