describe('resume router', () => {
  it('exports resumeRouter', async () => {
    const modFile = await import('../resume');
    expect(modFile.resumeRouter).toBeDefined();
  });
});
