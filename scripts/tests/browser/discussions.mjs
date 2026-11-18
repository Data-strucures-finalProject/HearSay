import { chromium } from '/tmp/hearsay-browser/node_modules/playwright/index.mjs';
import { exerciseDiscussions } from './discussion-fixtures.mjs';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium-browser', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try { console.log(JSON.stringify(await exerciseDiscussions(await browser.newPage(), 'http://frontend'))); }
finally { await browser.close(); }
