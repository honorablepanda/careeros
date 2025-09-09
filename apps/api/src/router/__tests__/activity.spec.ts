describe('activity router', () => {
  it('exports activityRouter', async () => {
    const modFile = await import('../activity');
    expect(modFile.activityRouter).toBeDefined();
  });
});
