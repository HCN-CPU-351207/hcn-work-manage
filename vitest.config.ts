import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // test đồng bộ dò cả dải mạng thật (vài giây)
    testTimeout: 30_000
  }
});
