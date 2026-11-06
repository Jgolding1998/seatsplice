import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

async function signup(page, name, skill = 'React') {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Email', { exact: true }).fill(`${randomUUID()}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill('fixture password for browser tests');
  await page.getByRole('button', { name: 'Continue' }).click();
  const skills = page.getByLabel('Your skills', { exact: true });
  await skills.fill(skill);
  await skills.press('Enter');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
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
    await expect(applicant.getByRole('link', { name: 'Keyboard Kernel' })).toHaveCount(0);
    expect(failures).toEqual([]);
  } finally {
    await context.close();
  }
});

test('board renders placeholders during a slow response, supports filters, and respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signup(page, 'Load State Reader');
  let release;
  const delay = new Promise(resolve => { release = resolve; });
  await page.route('**/api/board*', async route => {
    await delay;
    await route.continue();
  });
  await page.getByRole('link', { name: 'Board', exact: true }).click();
  const skeleton = page.locator('.loading-board .skeleton-line').first();
  await expect(skeleton).toBeVisible();
  await expect(skeleton).toHaveCSS('animation-name', 'none');
  release();
  await expect(page.getByRole('link', { name: 'Rubber Duck Debuggers' })).toBeVisible();
  const search = page.getByLabel('Search teams');
  await search.fill('Rubber Duck');
  await expect(page.locator('.board-row')).toHaveCount(1);
  await expect(search).toBeFocused();
});

test('phone layout fits and keyboard can navigate from the board to a team', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 812 });
  await signup(page, 'Pocket Debugger');
  await page.getByRole('link', { name: 'Board', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Board', exact: true })).toBeFocused();
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

test('automated accessibility checks pass on sign-in, board and team screens', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
  const scan = async () => {
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(node => node.target) }))).toEqual([]);
  };
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
  const inviteUrl = await link.inputValue();
  const context = await browser.newContext({ baseURL });
  try {
    const guest = await context.newPage();
    await signup(guest, 'Invite Guest');
    await guest.goto(inviteUrl);
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
