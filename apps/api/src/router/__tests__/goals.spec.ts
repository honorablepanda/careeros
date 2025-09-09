describe('goals router', () => {
  it('exports goalsRouter', async () => {
    const modFile = await import('../goals');
    expect(modFile.goalsRouter).toBeDefined();
  });
});
