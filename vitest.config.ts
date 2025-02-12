import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    testTransformMode: {
      web: ['/\.[jt]sx?$/'],
    },
    // solid needs to be inline to work around
    // a resolution issue in vitest:
    deps: {
      inline: [/solid-js/],
    },
    // if you have few tests, try commenting one
    // or both out to improve performance:
    isolate: false,
  },
  resolve: {
    conditions: ['development', 'browser'],
  },
})