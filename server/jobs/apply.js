import { leverTarget } from './sources.js';

// This adapter only acts on Lever's hosted forms. Model output never selects URLs,
// grants consent, supplies personal facts, or determines whether submission succeeded.
export async function applyLever({ job, profile, resume, signal }, dependencies = {}) {
  const target = leverTarget(job.applicationUrl);
  if (!target)
    return {
      status: 'needs_attention',
      detail: 'This site needs a manual application. Open the listing to continue.',
    };
  const chromium = dependencies.chromium || (await import('playwright')).chromium;
  let browser,
    sending = false;
  try {
    for (const channel of ['chrome', 'msedge', undefined]) {
      try {
        browser = await chromium.launch({ ...(channel ? { channel } : {}), headless: false });
        break;
      } catch {}
    }
    if (!browser) throw new Error('No supported browser installed.');
    const context = await browser.newContext({ acceptDownloads: false, serviceWorkers: 'block' });
    await context.route('**/*', async (route) => {
      const u = new URL(route.request().url());
      const allowed =
        u.protocol === 'https:' &&
        !u.port &&
        !u.username &&
        !u.password &&
        (u.hostname === target.host ||
          /(^|\.)lever\.(co|com)$/.test(u.hostname) ||
          /(^|\.)hcaptcha\.com$/.test(u.hostname) ||
          ['www.google.com', 'www.gstatic.com', 'www.recaptcha.net'].includes(u.hostname));
      // Permit application writes only to the selected employer's posting.
      if (
        !['GET', 'HEAD', 'OPTIONS'].includes(route.request().method()) &&
        u.hostname.includes('lever.')
      ) {
        if (
          u.hostname !== target.host ||
          !(
            u.pathname === '/parseResume' ||
            (sending &&
              [target.url, `https://${target.host}/${target.site}/${target.posting}`].includes(
                u.origin + u.pathname,
              ))
          )
        )
          return route.abort();
      }
      return allowed ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const abort = () => {
      void browser.close().catch(() => {});
    };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      signal?.throwIfAborted();
      await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 35000 });
      if (leverTarget(page.url())?.url !== target.url)
        throw new Error('The application page changed destination.');
      const form = page.locator('form').filter({ has: page.locator('input[name="email"]') });
      if ((await form.count()) !== 1)
        return {
          status: 'needs_attention',
          detail: 'The application form could not be identified. Open the listing to continue.',
        };
      // Only exact, known fields receive profile values.
      for (const [name, value] of Object.entries({
        name: profile.fullName,
        email: profile.email,
        phone: profile.phone,
        location: profile.currentLocation,
        org: profile.currentCompany,
        'urls[LinkedIn]': profile.linkedin,
        'urls[Portfolio]': profile.portfolio,
        comments: profile.coverLetter,
      })) {
        const field = form.locator(`[name="${name}"]`);
        if (value && (await field.count()) === 1 && (await field.isVisible()))
          await field.fill(value);
      }
      for (const answer of profile.answers) {
        let field = form.getByLabel(answer.question, { exact: true });
        if ((await field.count()) !== 1) {
          const indexes = await form.locator('input,select,textarea').evaluateAll(
            (fields, question) =>
              fields.flatMap((f, i) => {
                const label = f
                  .closest('.application-question')
                  ?.querySelector('.application-label')
                  ?.textContent?.replace(/\*/g, '')
                  .trim();
                return label === question ? [i] : [];
              }),
            answer.question,
          );
          if (indexes.length !== 1) continue;
          field = form.locator('input,select,textarea').nth(indexes[0]);
        }
        if ((await field.count()) !== 1 || !(await field.isVisible())) continue;
        const tag = await field.evaluate((el) => ({ tag: el.tagName, type: el.type }));
        if (tag.tag === 'SELECT') await field.selectOption({ label: answer.answer });
        else if (['text', 'textarea', 'email', 'tel', 'url', 'number'].includes(tag.type))
          await field.fill(answer.answer);
      }
      // Unknown custom answers and consent checkboxes require the applicant's input.
      const missing = await form.evaluate((el) =>
        [...el.querySelectorAll('input,select,textarea')]
          .filter((f) => {
            if (
              f.disabled ||
              f.type === 'hidden' ||
              f.type === 'file' ||
              !f.getClientRects().length
            )
              return false;
            const wrapper = f.closest('.application-question');
            const required =
              f.required ||
              f.getAttribute('aria-required') === 'true' ||
              Boolean(wrapper?.querySelector('.required, .asterisk'));
            return (
              (required || f.type === 'checkbox' || f.type === 'radio') &&
              (['checkbox', 'radio'].includes(f.type) ? !f.checked : !f.value.trim())
            );
          })
          .map((f) => f.labels?.[0]?.textContent?.trim() || f.name || 'An application question'),
      );
      if (missing.length)
        return {
          status: 'needs_attention',
          detail: `Complete these questions on the employer site: ${missing.slice(0, 8).join('; ')}`,
        };
      const file = form.locator('input[type="file"][name="resume"]');
      if ((await file.count()) !== 1)
        return {
          status: 'needs_attention',
          detail: 'The résumé upload field changed. Open the listing to continue.',
        };
      await file.setInputFiles({ name: resume.name, mimeType: resume.mime, buffer: resume.data });
      // Active challenges must be solved by the user; never bypass them.
      const challenge = page.locator(
        'iframe[src*="recaptcha"][title*="challenge"], iframe[src*="hcaptcha"], .h-captcha',
      );
      for (let i = 0; i < (await challenge.count()); i++)
        if (await challenge.nth(i).isVisible())
          return {
            status: 'needs_attention',
            detail:
              'The employer requires a CAPTCHA. Open the application and complete it yourself.',
          };
      const submit = form.locator(
        'button[data-qa="btn-submit"]:visible, button[type="submit"]:visible, input[type="submit"]:visible',
      );
      if ((await submit.count()) !== 1 || !(await submit.isEnabled()))
        return {
          status: 'needs_attention',
          detail: 'The form needs more input before submission.',
        };
      if (!(await form.evaluate((el) => el.checkValidity())))
        return {
          status: 'needs_attention',
          detail:
            'The employer requires additional or corrected answers. Open the application to continue.',
        };
      signal?.throwIfAborted();
      sending = true;
      await submit.click();
      // Only an explicit confirmation on this exact trusted posting is a receipt.
      await page.waitForFunction(
        () =>
          Boolean(
            [...document.querySelectorAll('.application-confirmation, .application-success')].some(
              (el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden',
            ) || /\/thanks\/?$/.test(location.pathname),
          ),
        null,
        { timeout: 20000 },
      );
      const confirmationURL = new URL(page.url());
      if (
        confirmationURL.origin !== `https://${target.host}` ||
        ![target.url, `https://${target.host}/${target.site}/${target.posting}/thanks`].includes(
          confirmationURL.origin + confirmationURL.pathname.replace(/\/$/, ''),
        )
      )
        throw new Error('Unrecognized confirmation destination.');
      const receipt = (
        await page
          .locator(
            /\/thanks\/?$/.test(confirmationURL.pathname)
              ? 'body'
              : '.application-confirmation, .application-success',
          )
          .first()
          .innerText()
      ).trim();
      if (
        !/application|applied/i.test(receipt) ||
        !/thank you|application.{0,40}(?:received|submitted)|successfully applied/i.test(receipt) ||
        /\b(?:not submitted|not received|failed|error)\b/i.test(receipt)
      )
        throw new Error('Unrecognized receipt.');
      return {
        status: 'submitted',
        detail: receipt.slice(0, 1000),
        receiptUrl: page.url(),
        submittedAt: new Date().toISOString(),
      };
    } finally {
      signal?.removeEventListener('abort', abort);
    }
  } catch {
    return {
      status: sending ? 'uncertain' : 'needs_attention',
      detail: sending
        ? 'Submission was attempted but a receipt was not confirmed. Check the employer site or your email before retrying.'
        : 'The browser could not complete this form. Install Google Chrome or Microsoft Edge if needed, or open the listing and apply manually.',
    };
  } finally {
    await browser?.close().catch(() => {});
  }
}
