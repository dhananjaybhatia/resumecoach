"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import Link from "next/link";

const HomePage = () => {
  const [showButton, setShowButton] = useState(false);
  const [currentText, setCurrentText] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);

  const fullText = "it’s not just a résumé, your ticket to a dream job";
  const subText =
    "AI-powered feedback with ATS scoring and job-description matching.";

  useEffect(() => {
    if (currentIndex < fullText.length) {
      const timeout = setTimeout(() => {
        setCurrentText((prev) => prev + fullText[currentIndex]);
        setCurrentIndex((prev) => prev + 1);
      }, 100); // Typing speed

      return () => clearTimeout(timeout);
    } else {
      // Show button after typing is complete
      setTimeout(() => {
        setShowButton(true);
      }, 500);
    }
  }, [currentIndex, fullText]);

  return (
    <main className="h-screen w-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 fixed inset-0 !mx-0 !px-0 !pt-0 !max-w-none">
      <div className="text-center">
        {/* Main typing text */}
        <motion.h1
          className="text-4xl sm:text-5xl md:text-6xl font-bold text-gray-800 mb-4"
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

        {/* Subtitle */}
        <motion.div
          className="text-lg sm:text-xl font-light mb-8 relative tracking-wider"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.5, duration: 0.8, ease: "easeOut" }}
        >
          <motion.span
            className="bg-gradient-to-r from-slate-600 via-slate-800 to-slate-900 bg-clip-text text-transparent font-light"
            animate={{
              backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "linear",
            }}
            style={{
              backgroundSize: "200% 200%",
            }}
          >
            {subText}
          </motion.span>

          {/* Subtle luxury glow */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-slate-400/10 via-slate-600/15 to-slate-800/10 blur-2xl -z-10"
            animate={{
              opacity: [0.1, 0.3, 0.1],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />

          {/* Floating particles effect */}
          {[...Array(3)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 bg-slate-400/30 rounded-full"
              style={{
                left: `${20 + i * 30}%`,
                top: `${-10 + i * 5}px`,
              }}
              animate={{
                y: [0, -20, 0],
                opacity: [0.3, 0.8, 0.3],
                scale: [1, 1.2, 1],
              }}
              transition={{
                duration: 3 + i * 0.5,
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.3,
              }}
            />
          ))}
        </motion.div>

        {/* Upload Resume Button */}
        <AnimatePresence>
          {showButton && (
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{
                type: "spring",
                stiffness: 200,
                damping: 20,
                delay: 0.2,
              }}
            >
              <Link href="/resume">
                <motion.button
                  className="inline-flex items-center px-8 py-4 text-lg font-semibold text-white bg-gradient-to-r from-orange-500 to-red-500 rounded-full shadow-lg hover:shadow-xl transition-all duration-300"
                  whileHover={{
                    scale: 1.05,
                    boxShadow: "0 20px 40px rgba(249, 115, 22, 0.4)",
                  }}
                  whileTap={{ scale: 0.95 }}
                >
                  Upload Resume
                  <motion.svg
                    className="ml-2 w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    initial={{ x: 0 }}
                    animate={{ x: [0, 5, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </motion.svg>
                </motion.button>
              </Link>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Free scan info */}
        <AnimatePresence>
          {showButton && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: 0.8,
                duration: 0.6,
                ease: "easeOut",
              }}
              className="mt-6"
            >
              <p className="text-sm text-gray-600 font-medium">
                1 free scan daily • 2x more when you sign up
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
};

export default HomePage;
