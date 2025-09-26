// test-rate-limit.js - Simple script to test rate limiting
const BASE_URL = "http://localhost:3000";

async function testRateLimit() {
  console.log("🧪 Testing Rate Limiting...\n");

  try {
    // Test 1: Check current rate limit status
    console.log("📊 Test 1: Checking current rate limit status...");
    const statusResponse = await fetch(`${BASE_URL}/api/test-rate-limit`);
    const statusData = await statusResponse.json();

    console.log("Current Status:", {
      allowed: statusData.rateLimit?.allowed,
      remaining: statusData.rateLimit?.remaining,
      limit: statusData.rateLimit?.limit,
      isAuthenticated: statusData.auth?.isAuthenticated,
      resetDate: statusData.rateLimit?.resetDate,
    });

    // Test 2: Make multiple requests to test rate limiting
    console.log(
      "\n🔄 Test 2: Making multiple requests to test rate limiting..."
    );

    const requests = [];
    for (let i = 1; i <= 5; i++) {
      requests.push(
        fetch(`${BASE_URL}/api/test-rate-limit`, { method: "POST" })
          .then(async (response) => {
            const data = await response.json();
            return {
              request: i,
              status: response.status,
              allowed: data.rateLimit?.allowed,
              remaining: data.rateLimit?.remaining,
              success: data.success,
            };
          })
          .catch((error) => ({
            request: i,
            error: error.message,
          }))
      );
    }

    const results = await Promise.all(requests);

    console.log("\n📈 Rate Limit Test Results:");
    results.forEach((result) => {
      if (result.error) {
        console.log(`❌ Request ${result.request}: Error - ${result.error}`);
      } else {
        const status = result.success ? "✅" : "❌";
        console.log(
          `${status} Request ${result.request}: Status ${result.status}, Remaining: ${result.remaining}, Allowed: ${result.allowed}`
        );
      }
    });

    // Test 3: Check final status
    console.log("\n📊 Test 3: Final rate limit status...");
    const finalResponse = await fetch(`${BASE_URL}/api/test-rate-limit`);
    const finalData = await finalResponse.json();

    console.log("Final Status:", {
      allowed: finalData.rateLimit?.allowed,
      remaining: finalData.rateLimit?.remaining,
      limit: finalData.rateLimit?.limit,
      resetDate: finalData.rateLimit?.resetDate,
    });

    // Summary
    console.log("\n📋 Summary:");
    const successfulRequests = results.filter((r) => r.success).length;
    const blockedRequests = results.filter(
      (r) => !r.success && !r.error
    ).length;

    console.log(`✅ Successful requests: ${successfulRequests}`);
    console.log(`❌ Blocked requests: ${blockedRequests}`);

    if (blockedRequests > 0) {
      console.log("🎉 Rate limiting is working correctly!");
    } else {
      console.log(
        "⚠️  Rate limiting might not be working - no requests were blocked"
      );
    }
  } catch (error) {
    console.error("❌ Test failed:", error.message);
  }
}

// Run the test
testRateLimit();
