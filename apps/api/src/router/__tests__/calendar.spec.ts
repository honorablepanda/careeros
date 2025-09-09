describe('calendar router', () => {
  it('exports calendarRouter', async () => {
    const modFile = await import('../calendar');
    expect(modFile.calendarRouter).toBeDefined();
  });
});
