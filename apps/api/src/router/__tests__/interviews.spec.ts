describe('interviews router', () => {
  it('exports interviewsRouter', async () => {
    const modFile = await import('../interviews');
    expect(modFile.interviewsRouter).toBeDefined();
  });
});
