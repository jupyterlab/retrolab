// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { test } from './fixtures';

import { expect } from '@playwright/test';

test.use({ autoGoto: false });

test.describe('Settings', () => {
  test('Should be persisted after reloading the page', async ({ page }) => {
    await page.goto('tree');
    await page.menu.clickMenuItem('View>Show Header');

    await page.reload();

    const logo = await page.evaluate(() => {
      return document.querySelector('#jp-RetroLogo');
    });

    expect(logo).toBeFalsy();
  });
});
