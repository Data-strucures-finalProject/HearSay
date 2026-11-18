import { connectMongo, closeMongo } from '../dbAPI.js';
import { installViews } from '../insights.js';

try {
  await installViews(await connectMongo());
  console.log('Installed all ten HearSay analytical views.');
} catch (error) {
  console.error('View installation failed:', error.message);
  process.exitCode = 1;
} finally { await closeMongo(); }
