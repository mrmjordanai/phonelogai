// Basic test to verify Jest configuration
describe('Basic Test', () => {
  it('should run a simple test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should have access to global __DEV__', () => {
    expect(typeof __DEV__).toBe('boolean');
  });
});