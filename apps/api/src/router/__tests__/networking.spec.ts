describe('networking router', () => {
  it('exports networkingRouter', async () => {
    const modFile = await import('../networking');
    expect(modFile.networkingRouter).toBeDefined();
  });
});
