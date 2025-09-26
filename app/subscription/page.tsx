"use client";

import { PricingTable } from "@clerk/nextjs";
import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";

const Subscription = () => {
  const fullText =
    "You're out of free scans. Skip the 24h wait—unlock unlimited and stay ahead";
  const typingText = "while you wait, someone else applies";

  const [currentText, setCurrentText] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showSecondText, setShowSecondText] = useState(false);

  useEffect(() => {
    if (currentIndex < typingText.length) {
      const timeout = setTimeout(() => {
        setCurrentText((prev) => prev + typingText[currentIndex]);
        setCurrentIndex((prev) => prev + 1);
      }, 100); // Typing speed

      return () => clearTimeout(timeout);
    } else {
      // Show second text after typing is complete
      setTimeout(() => {
        setShowSecondText(true);
      }, 500);
    }
  }, [currentIndex, typingText]);

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent mb-6">
            Choose Your Plan
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Get unlimited access to our AI-powered resume analysis tools and
            boost your job search success.
          </p>
        </div>

        <div style={{ maxWidth: "800px", margin: "0 auto", padding: "0 1rem" }}>
          <PricingTable />
        </div>

        {/* Typing animation message for rate-limited users */}
        <div className="mt-16 text-center">
          {/* Typing animation with ticker */}
          <motion.h1
            className="text-2xl sm:text-5xl md:text-4xl font-bold text-gray-800 mb-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            {currentText}
            <motion.span
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 0.8, repeat: Infinity }}
              className="text-orange-500"
            >
              |
            </motion.span>
          </motion.h1>

          {/* Second text that appears slowly */}
          {showSecondText && (
            <motion.p
              className="text-lg text-gray-600 mb-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              {fullText}
            </motion.p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Subscription;
