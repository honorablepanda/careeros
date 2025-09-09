describe('notifications router', () => {
  it('exports notificationsRouter', async () => {
    const modFile = await import('../notifications');
    expect(modFile.notificationsRouter).toBeDefined();
  });
});
