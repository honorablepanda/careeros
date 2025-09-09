describe('profile router', () => {
  it('exports profileRouter', async () => {
    const modFile = await import('../profile');
    expect(modFile.profileRouter).toBeDefined();
  });
});
