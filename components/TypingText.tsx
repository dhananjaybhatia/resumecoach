"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface TypingTextProps {
  text: string;
  delay?: number;
  className?: string;
  showCursor?: boolean;
  speed?: number;
  cursorColor?: string;
  onComplete?: () => void;
}

const TypingText = ({
  text,
  delay = 0,
  className = "text-4xl text-black font-bold mb-8",
  showCursor = true,
  speed = 100,
  cursorColor = "bg-black",
  onComplete,
}: TypingTextProps) => {
  const [displayText, setDisplayText] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsTyping(true);
    }, delay * 1000);

    return () => clearTimeout(timer);
  }, [delay]);

  useEffect(() => {
    if (!isTyping) return;

    if (currentIndex < text.length) {
      const timeout = setTimeout(() => {
        setDisplayText((prev) => prev + text[currentIndex]);
        setCurrentIndex((prev) => prev + 1);
      }, speed);

      return () => clearTimeout(timeout);
    } else if (onComplete) {
      onComplete();
    }
  }, [currentIndex, text, speed, isTyping, onComplete]);

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
    >
      <span className="inline-block">
        {displayText}
        {showCursor && isTyping && currentIndex < text.length && (
          <motion.span
            animate={{ opacity: [1, 0, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
            className={`inline-block w-0.5 h-full ${cursorColor} ml-1`}
            style={{ height: "1.2em", verticalAlign: "text-top" }}
          />
        )}
      </span>
    </motion.div>
  );
};

export default TypingText;
