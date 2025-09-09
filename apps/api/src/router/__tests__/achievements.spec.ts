describe('achievements router', () => {
  it('exports achievementsRouter', async () => {
    const modFile = await import('../achievements');
    expect(modFile.achievementsRouter).toBeDefined();
  });
});
