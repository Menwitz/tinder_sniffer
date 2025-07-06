// hinge_signin_minimal.js
const axios = require('axios');

const API_KEY = process.env.RAPIDAPI_KEY || 'YOUR_RAPIDAPI_KEY';
const HOST    = 'hinge-v1-terminal-rest.p.rapidapi.com';
const URL     = `https://${HOST}/sessions`;

async function main() {
  try {
    const res = await axios.post(URL, { phone_number: '19296318842' }, {
      headers: {
        'Content-Type': 'application/json',
        'X-RapidAPI-Key': API_KEY,
        'X-RapidAPI-Host': HOST
      }
    });
    console.log('200 OK:', res.data);
  } catch (err) {
    if (err.response) {
      console.log(err.response.status, err.response.data);
      const retry = err.response.headers['retry-after'];
      if (err.response.status === 429 && retry) {
        console.log(`Rate-limited. Retry after ${retry}s`);
      }
    } else {
      console.error(err.message);
    }
  }
}

main();