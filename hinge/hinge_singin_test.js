// hinge_signin_test.js
// Usage: node hinge_signin_test.js

const axios = require("axios");
const API_KEY = process.env.RAPIDAPI_KEY || "YOUR_RAPIDAPI_KEY";
const HOST    = "hinge-v1-terminal-rest.p.rapidapi.com";
const URL     = `https://${HOST}/sessions`;

async function testSignin(phone) {
  console.log(`\n>> Testing sign-in for: ${phone}`);
  try {
    const response = await axios.post(URL, { phone_number: phone }, {
      headers: {
        "Content-Type": "application/json",
        "X-RapidAPI-Key": API_KEY,
        "X-RapidAPI-Host": HOST
      }
    });
    console.log("Status:", response.status);
    console.dir(response.data, { depth: null });
  } catch (err) {
    if (err.response) {
      console.log("Status:", err.response.status);
      console.dir(err.response.data, { depth: null });
    } else {
      console.error("Error:", err.message);
    }
  }
}

(async () => {
  await testSignin("+19296318842");
  await testSignin("invalid_number");
})();