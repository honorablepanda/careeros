describe('summary router', () => {
  it('exports summaryRouter', async () => {
    const modFile = await import('../summary');
    expect(modFile.summaryRouter).toBeDefined();
  });
});
