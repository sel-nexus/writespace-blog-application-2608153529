/** Capture browser failures before navigation and assert them after each journey. */
import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  browserErrors: [async ({ page }, use) => {
    const errors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await use(errors);
    expect(errors, 'No console or uncaught page errors').toEqual([]);
  }, { auto: true }],
});
export { expect };
