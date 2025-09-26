import { Protect } from "@clerk/nextjs";
import React from "react";

const PremiumPage = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-orange-50">
      <div className="container mx-auto px-4 py-16">
        <Protect
          feature="unlimited_scans"
          fallback={
            <div className="text-center">
              <h1 className="text-4xl font-bold text-gray-900 mb-6">
                Premium Content
              </h1>
              <p className="text-xl text-gray-600 mb-8">
                This content is only available to users with unlimited scans.
              </p>
              <a
                href="/subscription"
                className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-8 py-3 rounded-lg font-semibold hover:from-orange-600 hover:to-red-600 transition-all"
              >
                Upgrade to Unlimited
              </a>
            </div>
          }
        >
          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-900 mb-6">
              🎉 Welcome to Premium!
            </h1>
            <p className="text-xl text-gray-600 mb-8">
              You have unlimited access to all our features.
            </p>
            <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
              <div className="p-6 bg-white rounded-lg shadow-lg">
                <h3 className="text-xl font-semibold mb-4">Unlimited Scans</h3>
                <p className="text-gray-600">
                  Scan as many resumes as you need
                </p>
              </div>
              <div className="p-6 bg-white rounded-lg shadow-lg">
                <h3 className="text-xl font-semibold mb-4">Priority Support</h3>
                <p className="text-gray-600">Get help when you need it</p>
              </div>
              <div className="p-6 bg-white rounded-lg shadow-lg">
                <h3 className="text-xl font-semibold mb-4">
                  Advanced Features
                </h3>
                <p className="text-gray-600">Access to all premium tools</p>
              </div>
            </div>
          </div>
        </Protect>
      </div>
    </div>
  );
};

export default PremiumPage;
