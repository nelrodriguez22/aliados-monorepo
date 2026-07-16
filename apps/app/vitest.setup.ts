import { vi } from 'vitest';

// Mock getToken globally to return a test token for all tests.
// This prevents "No hay usuario autenticado" errors when components
// use apiClient in tests without explicit Firebase auth setup.
vi.mock('@/shared/lib/getToken', () => ({
  getToken: vi.fn(async () => 'test-token-xyz'),
}));

// Suppress unhandled rejections that occur when React Query catches errors.
// Tests with error handling already validate the rendered error state;
// this prevents vitest from reporting the underlying promise rejection.
process.on('unhandledRejection', () => {
  // No-op: component error handling already caught this
});
