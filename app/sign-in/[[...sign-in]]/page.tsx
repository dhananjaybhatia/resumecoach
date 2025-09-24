"use client";

import { SignIn } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";

export default function Page() {
  const searchParams = useSearchParams();
  const fromRateLimit = searchParams.get("from") === "rate-limit";

  const [currentText, setCurrentText] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const fullText =
    "You've used your daily free scan limit. Sign up for more daily scans!";

  useEffect(() => {
    if (fromRateLimit && currentIndex < fullText.length) {
      const timeout = setTimeout(() => {
        setCurrentText((prev) => prev + fullText[currentIndex]);
        setCurrentIndex((prev) => prev + 1);
      }, 50); // Faster typing speed for shorter text

      return () => clearTimeout(timeout);
    }
  }, [currentIndex, fullText, fromRateLimit]);

  return (
    <main className="flex flex-col items-center justify-start min-h-screen py-16 px-4 overflow-hidden">
      {/* Clerk Sign In Component */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-16"
      >
        <SignIn redirectUrl="/resume" signUpUrl="/sign-up" />
      </motion.div>

      {/* Rate Limit Typing Effect Message - Below Clerk Modal */}
      {fromRateLimit && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-6 max-w-md mx-auto text-center"
        >
          <motion.div
            className="text-lg font-semibold text-gray-800"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            {currentText}
            <motion.span
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 0.8, repeat: Infinity }}
              className="text-orange-500"
            >
              |
            </motion.span>
          </motion.div>
        </motion.div>
      )}
    </main>
  );
}
