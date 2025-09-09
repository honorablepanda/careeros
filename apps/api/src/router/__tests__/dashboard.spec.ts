describe('dashboard router', () => {
  it('exports dashboardRouter', async () => {
    const modFile = await import('../dashboard');
    expect(modFile.dashboardRouter).toBeDefined();
  });
});
