describe('roadmap router', () => {
  it('exports roadmapRouter', async () => {
    const modFile = await import('../roadmap');
    expect(modFile.roadmapRouter).toBeDefined();
  });
});
