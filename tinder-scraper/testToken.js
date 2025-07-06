import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const TOKENS = process.env.TINDER_TOKENS?.split(',').map(t => t.trim());
const TEST_LAT = parseFloat(process.env.MIN_LAT) || 48.85;
const TEST_LON = parseFloat(process.env.MIN_LON) || 2.35;

if (!TOKENS?.length) {
  console.error('❌ No TINDER_TOKENS in .env');
  process.exit(1);
}

(async () => {
  for (const token of TOKENS) {
    try {
      const res = await axios.get('https://api.gotinder.com/v2/recs/core', {
        headers: { 'X-Auth-Token': token },
        params: { locale: 'en', lat: TEST_LAT, lon: TEST_LON, count: 1 },
        timeout: 10000
      });
      if (res.status === 200 && res.data?.data?.results) {
        console.log(`✅ Valid token: ${token}`);
      } else {
        console.log(`❌ Unexpected response for token: ${token}`);
      }
    } catch (e) {
      if (e.response?.status === 401) {
        console.log(`❌ Invalid token (401): ${token}`);
      } else if (e.response?.status === 429) {
        console.log(`⚠️ Rate limited but token works: ${token}`);
      } else {
        console.log(`❌ Error for token ${token}: ${e.message}`);
      }
    }
  }
})();
