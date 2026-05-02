globalThis.import = { meta: { env: { VITE_API_URL: 'https://50g0tuzmrc.execute-api.us-east-2.amazonaws.com/prod/api' } } };

// Mock window.matchMedia for jsdom tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});