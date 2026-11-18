import { defineConfig, configDefaults } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    clearMocks: true,
    setupFiles: ['.vite/setup-files.js'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['src/**/*.js'],
      exclude: [
        ...configDefaults.exclude,
        '.public',
        'coverage',
        'postcss.config.js',
        'stylelint.config.js',
        'vitest.config.js',
        '.sonarlint',
        'babel.config.cjs'
      ],
      // 100% and no source exclusions: code that no test can run is dead
      // and gets deleted (see AGENTS.md, Testing).
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100
      }
    }
  }
})
