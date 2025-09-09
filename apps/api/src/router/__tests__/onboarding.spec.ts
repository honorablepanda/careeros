describe('onboarding router', () => {
  it('exports onboardingRouter', async () => {
    const modFile = await import('../onboarding');
    expect(modFile.onboardingRouter).toBeDefined();
  });
});
