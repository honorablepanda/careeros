describe('auth router', () => {
  it('exports authRouter', async () => {
    const modFile = await import('../auth');
    expect(modFile.authRouter).toBeDefined();
  });
});
