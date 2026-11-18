import { connectMongo, closeMongo } from '../dbAPI.js';
import { validateDatabase } from '../databaseValidation.js';

try {
  const report = await validateDatabase(await connectMongo());
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
} finally { await closeMongo(); }
