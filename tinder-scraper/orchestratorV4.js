import { readFileSync } from 'fs';
import { spawn } from 'child_process';
import path from 'path';

async function runCityJob(job) {
  const env = {
    ...process.env,
    MIN_LAT: job.minLat,
    MAX_LAT: job.maxLat,
    MIN_LON: job.minLon,
    MAX_LON: job.maxLon,
    CITY_NAME: job.city,
    COUNTRY_NAME: job.country
  };
  console.log(`\nStarting scrape for ${job.country}/${job.city}`);
  await new Promise(resolve => {
    const child = spawn(
      'node',
      [path.join(process.cwd(), 'scraperV4.js')],
      { env, stdio: 'inherit' }
    );
    child.on('exit', resolve);
  });
}

async function main() {
  const jobs = JSON.parse(readFileSync('citiesV4.json', 'utf8'));
  for (const job of jobs) {
    await runCityJob(job);
  }
  console.log('All city jobs complete.');
}

main();
