describe('planner router', () => {
  it('exports plannerRouter', async () => {
    const modFile = await import('../planner');
    expect(modFile.plannerRouter).toBeDefined();
  });
});
