// Debug rate limiting
const BASE_URL = "http://localhost:3000";

async function debugRateLimit() {
  console.log("🔍 Debugging Rate Limiting...\n");

  try {
    // Test 1: Check current status
    console.log("1. Checking rate limit status...");
    const response = await fetch(`${BASE_URL}/api/test-rate-limit`);

    if (!response.ok) {
      console.log(`❌ Status check failed: ${response.status}`);
      const errorText = await response.text();
      console.log("Error response:", errorText);
      return;
    }

    const data = await response.json();
    console.log("✅ Status check successful:");
    console.log(JSON.stringify(data, null, 2));

    // Test 2: Make a POST request (simulates resume analysis)
    console.log("\n2. Testing POST request (simulates resume analysis)...");
    const postResponse = await fetch(`${BASE_URL}/api/test-rate-limit`, {
      method: "POST",
    });

    console.log(`POST Response Status: ${postResponse.status}`);

    if (!postResponse.ok) {
      console.log(`❌ POST request failed: ${postResponse.status}`);
      const errorText = await postResponse.text();
      console.log("Error response:", errorText);
    } else {
      const postData = await postResponse.json();
      console.log("✅ POST request successful:");
      console.log(JSON.stringify(postData, null, 2));
    }

    // Test 3: Check status again
    console.log("\n3. Checking rate limit status after POST...");
    const finalResponse = await fetch(`${BASE_URL}/api/test-rate-limit`);
    const finalData = await finalResponse.json();
    console.log("Final Status:");
    console.log(JSON.stringify(finalData, null, 2));
  } catch (error) {
    console.error("❌ Debug failed:", error.message);
  }
}

debugRateLimit();
