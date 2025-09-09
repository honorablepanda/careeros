describe('skills router', () => {
  it('exports skillsRouter', async () => {
    const modFile = await import('../skills');
    expect(modFile.skillsRouter).toBeDefined();
  });
});
