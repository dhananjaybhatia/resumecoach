// Simple test to check rate limiting
const BASE_URL = "http://localhost:3000";

async function simpleTest() {
  console.log("🧪 Simple Rate Limit Test\n");

  try {
    // Test 1: Check status
    console.log("1. Checking rate limit status...");
    const response = await fetch(`${BASE_URL}/api/test-rate-limit`);
    const data = await response.json();

    console.log("Status:", {
      allowed: data.rateLimit?.allowed,
      remaining: data.rateLimit?.remaining,
      limit: data.rateLimit?.limit,
      isAuthenticated: data.auth?.isAuthenticated,
    });

    // Test 2: Make a POST request (simulates resume analysis)
    console.log("\n2. Testing POST request (simulates resume analysis)...");
    const postResponse = await fetch(`${BASE_URL}/api/test-rate-limit`, {
      method: "POST",
    });
    const postData = await postResponse.json();

    console.log("POST Result:", {
      status: postResponse.status,
      success: postData.success,
      allowed: postData.rateLimit?.allowed,
      remaining: postData.rateLimit?.remaining,
    });

    if (postResponse.status === 429) {
      console.log("✅ Rate limiting is working - request was blocked!");
    } else {
      console.log(
        "⚠️  Rate limiting might not be working - request was allowed"
      );
    }
  } catch (error) {
    console.error("❌ Test failed:", error.message);
  }
}

simpleTest();
