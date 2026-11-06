import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

async function signup(page, name, skill = 'React', inviteUrl) {
  await page.goto(inviteUrl ?? '/');
  if (inviteUrl) await expect(page.getByText('You have a team invite')).toBeVisible();
  else {
    await page.getByRole('button', { name: 'Skip to sign-in' }).click();
    await page.getByRole('button', { name: 'Create an account' }).click();
  }
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Email', { exact: true }).fill(`${randomUUID()}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill('fixture password for browser tests');
  await page.getByRole('button', { name: 'Continue' }).click();
  const skills = page.getByLabel('Your skills', { exact: true });
  await skills.fill(skill);
  await skills.press('Enter');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  if (!inviteUrl) await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
}

async function makeTeam(page, name) {
  await page.getByRole('link', { name: 'Create a team', exact: true }).click();
  await page.getByLabel('Team name').fill(name);
  await page.getByLabel('What you are building').fill('A keyboard-first browser test.');
  const skills = page.getByLabel('Skills the team wants');
  await skills.fill('React');
  await skills.press('Enter');
  await page.getByLabel('Maximum seats').selectOption('2');
  await page.getByRole('button', { name: 'Create team', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}

function sphereImage(control) {
  return control.locator('canvas').evaluate(canvas => {
    const preview = document.createElement('canvas');
    preview.width = preview.height = 32;
    const ctx = preview.getContext('2d');
    ctx.drawImage(canvas, 0, 0, preview.width, preview.height);
    const alpha = Array.from(ctx.getImageData(0, 0, preview.width, preview.height).data)
      .filter((_, i) => i % 4 === 3);
    return alpha.some(Boolean) ? alpha : null;
  });
}

async function sphereDifference(control, reference) {
  const current = await sphereImage(control);
  if (!current) return NaN;
  return current.reduce((sum, pixel, i) => sum + Math.abs(pixel - reference[i]), 0) / current.length;
}

test('sign-in sphere follows mouse drag and supports keyboard rotation and reset', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const sphere = page.getByRole('button', { name: 'Rotate particle sphere' });
  const goldDot = page.getByRole('button', { name: 'Open sign-in' });
  const login = page.getByRole('heading', { name: 'Log in' });
  await expect(login).toBeHidden();
  await expect(goldDot).toBeHidden();
  await expect.poll(() => sphereImage(sphere)).not.toBeNull();
  const original = await sphereImage(sphere);
  const { x, y, width, height } = await sphere.boundingBox();
  expect(width).toBeGreaterThanOrEqual(page.viewportSize().width - 1);
  expect(height).toBeGreaterThanOrEqual(page.viewportSize().height - 1);
  await page.mouse.move(x + width * .52, y + height * .42);
  await page.mouse.down();
  await page.mouse.move(x + width * .67, y + height * .55, { steps: 5 });
  await expect.poll(() => sphereDifference(sphere, original)).toBeGreaterThan(.5);
  const dragged = await sphereImage(sphere);
  await page.mouse.up();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await sphereDifference(sphere, dragged)).toBeLessThan(.25);
  await sphere.press('ArrowUp');
  await expect.poll(() => sphereDifference(sphere, dragged)).toBeGreaterThan(.5);
  await sphere.press('Home');
  await expect.poll(() => sphereDifference(sphere, original)).toBeLessThan(.25);
  await sphere.press('Enter');
  await expect.poll(() => sphereDifference(sphere, original)).toBeGreaterThan(.5);
  await sphere.press('Home');
  await sphere.press('ArrowLeft');
  await sphere.press('ArrowLeft');
  await expect(goldDot).toBeVisible();
  const dotPosition = await goldDot.boundingBox();
  await sphere.press('ArrowLeft');
  await expect.poll(async () => (await goldDot.boundingBox())?.x).not.toBe(dotPosition.x);
  const { y: dotHeight } = await goldDot.boundingBox();
  await sphere.press('ArrowDown');
  await expect.poll(async () => (await goldDot.boundingBox())?.y).toBeGreaterThan(dotHeight);
  await goldDot.press('Enter');
  await expect(login).toBeFocused();
  expect(await page.locator('.signal-stage').evaluate(stage =>
    [...stage.childNodes].some(node => node.nodeType === Node.COMMENT_NODE && node.textContent.includes('stowaway duck'))
  )).toBe(true);
});

test('sign-in sphere supports touch swipe and tap on a phone', async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce'
  });
  try {
    const page = await context.newPage();
    await page.goto('/');
    const sphere = page.getByRole('button', { name: 'Rotate particle sphere' });
    await expect.poll(() => sphereImage(sphere)).not.toBeNull();
    const original = await sphereImage(sphere);
    const { x, y, width, height } = await sphere.boundingBox();
    const start = { x: Math.round(x + width * .67), y: Math.round(y + height * .36) };
    const touch = await context.newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: start.x + 23, y: start.y + 47 }]
    });
    await expect.poll(() => sphereDifference(sphere, original)).toBeGreaterThan(.5);
    const swiped = await sphereImage(sphere);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.touchscreen.tap(start.x, start.y);
    await expect.poll(() => sphereDifference(sphere, swiped)).toBeGreaterThan(.5);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: start.x - 185, y: start.y }]
    });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.getByRole('button', { name: 'Open sign-in' }).tap();
    await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
  } finally {
    await context.close();
  }
});

test('sign-in sphere coasts briefly after a flick and then comes to rest', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    window.spherePaintsAfterRelease = 0;
    let released = false;
    document.addEventListener('pointerup', () => { released = true; }, { once: true });
    const clearRect = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (released && this.canvas.matches('.signal-art')) window.spherePaintsAfterRelease++;
      return clearRect.apply(this, args);
    };
  });
  await page.goto('/');
  const sphere = page.getByRole('button', { name: 'Rotate particle sphere' });
  await expect.poll(() => sphereImage(sphere)).not.toBeNull();
  const { x, y, width, height } = await sphere.boundingBox();
  await page.mouse.move(x + width * .5, y + height * .4);
  await page.mouse.down();
  await page.mouse.move(x + width * .59, y + height * .4, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.spherePaintsAfterRelease)).toBeGreaterThan(2);
  // Give the documented 320 ms coast time to finish before sampling for stability.
  await page.waitForTimeout(400);
  const settled = await sphereImage(sphere);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await sphereDifference(sphere, settled)).toBeLessThan(.25);
});

test('versioned assets are cacheable and missing bundles return 404 instead of the app shell', async ({ request }) => {
  const shell = await request.get('/');
  expect(shell.headers()['cache-control']).toBe('no-cache');
  const bundle = (await shell.text()).match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
  expect(bundle).toBeTruthy();
  const asset = await request.get(bundle);
  expect(asset.ok()).toBe(true);
  expect(asset.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
  const missing = await request.get('/assets/missing-bundle.js');
  expect(missing.status()).toBe(404);
});

test('two signed-in browsers request and approve the final seat without refreshing', async ({ page, browser, baseURL }) => {
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  await signup(page, 'Browser Leader');
  await makeTeam(page, 'Keyboard Kernel');
  const teamUrl = page.url();
  const context = await browser.newContext({ baseURL });
  try {
    const applicant = await context.newPage();
    applicant.on('pageerror', error => failures.push(error.message));
    await signup(applicant, 'Browser Applicant', 'Python');
    await applicant.goto(teamUrl);
    await applicant.getByRole('button', { name: 'Request to join' }).click();
    await page.bringToFront();
    const approve = page.getByRole('button', { name: 'Approve Browser Applicant' });
    await expect(approve).toBeVisible();
    await approve.click();
    await expect(page.getByText('2 of 2 seats')).toBeVisible();
    await applicant.bringToFront();
    await expect(applicant.getByText('2 of 2 seats')).toBeVisible();
    await expect(applicant.getByRole('link', { name: 'My team' })).toBeVisible();
    await applicant.getByRole('link', { name: 'Board', exact: true }).click();
    await expect(applicant.getByRole('heading', { name: 'Open teams, page 1' })).toBeVisible();
    await applicant.getByRole('button', { name: 'List', exact: true }).click();
    await expect(applicant.getByRole('link', { name: 'Rubber Duck Debuggers' })).toBeVisible();
    await expect(applicant.getByRole('link', { name: 'Keyboard Kernel' })).toHaveCount(0);
    expect(failures).toEqual([]);
  } finally {
    await context.close();
  }
});

test('board renders placeholders during a slow response, supports filters, and respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let release;
  let boardRequests = 0;
  const delay = new Promise(resolve => { release = resolve; });
  await page.route('**/api/board*', async route => {
    boardRequests++;
    await delay;
    await route.continue();
  });
  await signup(page, 'Load State Reader');
  await expect(page.locator('.crew-welcome-word')).toHaveText('Welcome');
  await expect.poll(() => boardRequests).toBe(1);
  await page.getByRole('link', { name: 'Board', exact: true }).click();
  const skeleton = page.locator('.crew-gallery-loading .crew-placeholder').first();
  await expect(skeleton).toBeVisible();
  await expect(skeleton).toHaveCSS('animation-name', 'none');
  release();
  await expect(page.getByRole('link', { name: 'Rubber Duck Debuggers' })).toBeVisible();
  expect(boardRequests).toBe(1);
  const search = page.getByLabel('Search teams');
  await search.fill('Rubber Duck');
  await expect(page.locator('.crew-cover')).toHaveCount(1);
  await expect(search).toBeFocused();
  await expect(page.locator('.tab-blinds')).toHaveCount(0);
});

test('phone layout fits and keyboard can navigate from the board to a team', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 812 });
  await signup(page, 'Pocket Debugger');
  await page.getByRole('link', { name: 'Board', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Find a team', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Search teams')).toBeFocused();
  const link = page.getByRole('link', { name: 'Rubber Duck Debuggers' });
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Rubber Duck Debuggers' })).toBeVisible();
  const { viewport, content } = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth
  }));
  expect(content).toBeLessThanOrEqual(viewport);
});

test('compact navigation preserves desktop keyboard access and frees space on phones', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signup(page, 'Compact Navigator');
  const collapse = page.getByRole('button', { name: 'Collapse navigation' });
  const expand = page.getByRole('button', { name: 'Expand navigation' });
  const board = page.getByRole('link', { name: 'Board', exact: true });
  await collapse.focus();
  await page.keyboard.press('Enter');
  await expect(expand).toBeFocused();
  await expect(board).toBeVisible();
  await board.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Find a team' })).toBeVisible();
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(board).toBeHidden();
  await expand.click();
  await expect(board).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
});

test('automated accessibility checks pass on sign-in, board and team screens', async ({ page }) => {
  await page.goto('/');
  const open = page.getByRole('button', { name: 'Skip to sign-in' });
  await expect(open).toBeVisible();
  const scan = async () => {
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(node => node.target) }))).toEqual([]);
  };
  await scan();
  await open.click();
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
  await scan();
  await signup(page, 'Contrast Inspector');
  await page.getByRole('link', { name: 'Board', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Rubber Duck Debuggers' })).toBeVisible();
  await scan();
  await page.getByRole('link', { name: 'Rubber Duck Debuggers' }).click();
  await expect(page.getByRole('button', { name: 'Request to join' })).toBeVisible();
  await scan();
  await page.emulateMedia({ colorScheme: 'dark' });
  await scan();
});

test('dark system sign-in keeps failed login feedback accessible', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Skip to sign-in' }).click();
  await page.getByLabel('Email', { exact: true }).fill('unknown@example.test');
  await page.getByLabel('Password', { exact: true }).fill('unused fixture password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toContainText('The email or password is incorrect');
  const scan = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
  expect(scan.violations).toEqual([]);
});

test('participant-supplied markup renders as text and does not run', async ({ page }) => {
  await signup(page, 'Security Fixture');
  const payload = '<img src=x onerror=window.crewboardInjected=1>';
  await makeTeam(page, payload);
  await expect(page.getByRole('heading', { name: payload, exact: true })).toBeVisible();
  await expect(page.locator('img[src=x]')).toHaveCount(0);
  expect(await page.evaluate(() => window.crewboardInjected)).toBeUndefined();
});

test('an invite link waits for confirmation and claims its preapproved seat once', async ({ page, browser, baseURL }) => {
  await signup(page, 'Invite Owner');
  await makeTeam(page, 'Stack Trace Choir');
  await page.getByRole('button', { name: 'Create invite code' }).click();
  const link = page.getByLabel('Link', { exact: true });
  await expect(link).toHaveValue(/#\/join\?code=/);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.getByRole('button', { name: '✓ Copied' })).toBeVisible();
  const inviteUrl = await link.inputValue();
  const context = await browser.newContext({ baseURL });
  try {
    const guest = await context.newPage();
    await signup(guest, 'Invite Guest', 'React', inviteUrl);
    await expect(guest.getByLabel('Invite code')).toHaveValue(/^[A-Za-z0-9_-]{22}$/);
    await expect(guest.getByRole('link', { name: 'My team' })).toHaveCount(0);
    await guest.getByRole('button', { name: 'Use code' }).click();
    await expect(guest.getByRole('heading', { name: 'Stack Trace Choir' })).toBeVisible();
    await expect(guest.getByText('2 of 2 seats')).toBeVisible();
    await expect(guest.getByRole('link', { name: 'My team' })).toBeVisible();
  } finally {
    await context.close();
  }
});

test('gallery shows live seat counts and supports arrows, swipe, and list view', async ({ page }) => {
  await signup(page, 'Gallery Reader');
  await page.getByRole('link', { name: 'Board', exact: true }).click();
  const gallery = page.getByRole('region', { name: 'Team gallery' });
  await expect(gallery.getByRole('heading', { name: 'Rubber Duck Debuggers' })).toBeVisible();
  await expect(gallery.locator('[data-slot="0"]')).toContainText('2 open seats');
  const next = gallery.getByRole('button', { name: 'Next team' });
  await next.click();
  await expect(gallery.getByRole('heading', { name: 'Stack Underflow' })).toBeVisible();
  await next.press('ArrowLeft');
  await expect(gallery.getByRole('heading', { name: 'Rubber Duck Debuggers' })).toBeVisible();
  const stage = gallery.locator('.crew-stage');
  await stage.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 1, clientX: 180, clientY: 90 });
  await stage.dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 1, clientX: 105, clientY: 92 });
  await expect(gallery.getByRole('heading', { name: 'Stack Underflow' })).toBeVisible();
  await gallery.getByRole('link', { name: 'View team' }).click();
  await expect(page.getByRole('heading', { name: 'Stack Underflow' })).toBeVisible();
  await page.goBack();
  await expect(gallery.getByRole('heading', { name: 'Stack Underflow' })).toBeVisible();
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Rubber Duck Debuggers' })).toBeVisible();
  await expect(page.locator('.board-row').first()).toContainText('2 open seats');
});
