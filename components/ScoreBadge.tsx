import { motion } from "framer-motion";

interface ScoreBadgeProps {
  score: number;
}

const ScoreBadge: React.FC<ScoreBadgeProps> = ({ score }) => {
  let badgeColor = "";
  let badgeBg = "";
  let badgeText = "";

  if (score >= 80) {
    badgeColor = "text-green-700";
    badgeBg = "bg-green-100 border-green-200";
    badgeText = "Excellent";
  } else if (score >= 70) {
    badgeColor = "text-green-600";
    badgeBg = "bg-green-50 border-green-100";
    badgeText = "Strong";
  } else if (score >= 60) {
    badgeColor = "text-blue-600";
    badgeBg = "bg-blue-50 border-blue-100";
    badgeText = "Good";
  } else if (score >= 50) {
    badgeColor = "text-yellow-600";
    badgeBg = "bg-yellow-50 border-yellow-100";
    badgeText = "Fair";
  } else {
    badgeColor = "text-red-600";
    badgeBg = "bg-red-50 border-red-100";
    badgeText = "Needs Work";
  }

  return (
    <motion.div
      className={`inline-flex items-center px-3 py-1.5 rounded-full border ${badgeBg} ${badgeColor} shadow-sm`}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      whileHover={{ scale: 1.05 }}
    >
      <span className="text-xs font-semibold tracking-wide">{badgeText}</span>
    </motion.div>
  );
};

export default ScoreBadge;
