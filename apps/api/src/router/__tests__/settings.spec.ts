describe('settings router', () => {
  it('exports settingsRouter', async () => {
    const modFile = await import('../settings');
    expect(modFile.settingsRouter).toBeDefined();
  });
});
