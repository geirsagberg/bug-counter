import { expect, test, type Page } from '@playwright/test'

const MAILPIT_URL = 'http://127.0.0.1:54324'

async function openLatestMagicLink(page: Page, email: string) {
  let messageId = ''
  await expect
    .poll(async () => {
      const response = await fetch(`${MAILPIT_URL}/api/v1/messages`)
      const inbox = (await response.json()) as {
        messages: Array<{ ID: string; To: Array<{ Address: string }> }>
      }
      messageId =
        inbox.messages.find((message) =>
          message.To.some((recipient) => recipient.Address === email),
        )?.ID ?? ''
      return messageId
    })
    .not.toBe('')

  const response = await fetch(`${MAILPIT_URL}/api/v1/message/${messageId}`)
  const message = (await response.json()) as { HTML: string; Text: string }
  const content = message.HTML || message.Text
  const link = content
    .match(/https?:\/\/[^"'\s<>]+(?:token_hash|verify)[^"'\s<>]*/)?.[0]
    ?.replaceAll('&amp;', '&')
  expect(link).toBeTruthy()
  await page.goto(link!)
}

test('restores sign-in, joins a workspace, and shares a registration', async ({
  browser,
}) => {
  await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' })

  const ownerContext = await browser.newContext()
  const ownerPage = await ownerContext.newPage()
  await ownerPage.goto('/')
  await ownerPage.getByLabel('Email').fill('owner@example.com')
  await ownerPage.getByRole('button', { name: 'Send sign-in link' }).click()
  await openLatestMagicLink(ownerPage, 'owner@example.com')
  await ownerPage.getByLabel('Workspace name').fill('Release team')
  await ownerPage.getByRole('button', { name: 'Create workspace' }).click()
  await expect(ownerPage.getByRole('button', { name: 'New bug' })).toBeVisible()

  await ownerPage.reload()
  await expect(ownerPage.getByRole('button', { name: 'New bug' })).toBeVisible()
  await ownerPage.getByLabel('Workspace menu').click()
  await ownerPage.getByRole('button', { name: 'Create invitation' }).click()
  const invitationUrl = await ownerPage
    .getByLabel('Invitation link')
    .inputValue()

  const memberContext = await browser.newContext()
  const memberPage = await memberContext.newPage()
  await memberPage.goto(invitationUrl)
  await expect(
    memberPage.getByRole('heading', { name: 'Join Release team' }),
  ).toBeVisible()
  await memberPage.getByLabel('Email').fill('member@example.com')
  await memberPage.getByRole('button', { name: 'Send sign-in link' }).click()
  await openLatestMagicLink(memberPage, 'member@example.com')
  await expect(
    memberPage.getByRole('heading', { name: 'Join Release team' }),
  ).toBeVisible()
  await memberPage.getByRole('button', { name: 'Join workspace' }).click()
  await expect(
    memberPage.getByRole('button', { name: 'New bug' }),
  ).toBeVisible()

  await ownerPage.getByLabel('Workspace menu').click()
  await ownerPage.getByRole('button', { name: 'New bug' }).click()
  await ownerPage
    .getByRole('combobox', { name: 'Severity', exact: true })
    .selectOption('High')
  await ownerPage.getByPlaceholder('Choose or add one').fill('Production')
  await ownerPage.getByPlaceholder('What happened?').fill('Checkout failed')
  await ownerPage.getByRole('button', { name: 'Save' }).click()

  await memberPage.reload()
  await expect(
    memberPage.getByRole('heading', { name: 'Production' }),
  ).toBeVisible()
  await expect(memberPage.getByText('1 bug since')).toBeVisible()

  await memberContext.close()
  await ownerContext.close()
})
