import Image from "next/image";
import React, { useMemo, useEffect } from "react";
import { debug } from "@/lib/debug";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// Helper function to clean keywords
const cleanKeyword = (keyword: string): string => {
  if (!keyword) return "";

  // Remove common sentence endings and parentheticals
  return keyword
    .replace(
      /\b(?:is|are|was|were|has|have|had|will|would|could|should|must|can|may|might)\b.*$/i,
      ""
    )
    .replace(/\(.*?\)/g, "") // Remove parentheses content
    .replace(/\.$/, "") // Remove trailing period
    .replace(/\s*etc\.?\s*$/i, "") // Remove "etc"
    .replace(/\s*and\/or\s*/gi, " ") // Remove "and/or"
    .replace(/\s*is highly regarded\s*/gi, "") // Remove this phrase
    .replace(/\s*such as\s*/gi, " ") // Remove "such as"
    .replace(/\s*is required\s*/gi, "") // Remove "is required"
    .replace(/\s*is preferred\s*/gi, "") // Remove "is preferred"
    .replace(/\s*is desirable\s*/gi, "") // Remove "is desirable"
    .replace(/\s*is essential\s*/gi, "") // Remove "is essential"
    .replace(/\s*[,-]\s*$/, "") // Remove trailing commas/dashes
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
};

export type ATSDetails = {
  score: number;
  feedback?: string[];
  breakdown?: Array<{ label: string; score: number; max: number }>;
  keywords?: {
    pct: number;
    matched: string[];
    missing: string[];
    presentInJD: string[];
  };
  __coreMissing?: string[];
  jobFitScore?: {
    debug?: {
      evidencePreview?: {
        matched?: Array<{ item: string }>;
        missing?: Array<{ item: string }>;
      };
    };
  };
};

type BucketKey =
  | "Structure"
  | "Summary"
  | "Skills"
  | "Experience"
  | "Education"
  | "Keywords";

type Bucket = { key: BucketKey; got: number; max: number; message: string };

const BUCKET_ORDER: BucketKey[] = [
  "Structure",
  "Summary",
  "Skills",
  "Experience",
  "Education",
  "Keywords",
];

const DEFAULT_MAX: Record<BucketKey, number> = {
  Structure: 20,
  Summary: 20,
  Skills: 20,
  Experience: 20,
  Education: 10,
  Keywords: 10,
};

/* ---------------------------
   Helpers (MODULE SCOPE)
   --------------------------- */

// Canonicalise labels from server → our keys
const toKey = (raw: string): BucketKey | null => {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  switch (s) {
    case "structure":
      return "Structure";
    case "summary":
      return "Summary";
    case "skills":
      return "Skills";
    case "experience":
      return "Experience";
    case "education":
      return "Education";
    case "keywords":
      return "Keywords";
    default:
      return null;
  }
};

// Little tag with icon
const Pill: React.FC<{ kind: "ok" | "miss"; children: React.ReactNode }> = ({
  kind,
  children,
}) => (
  <span
    className={[
      "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border",
      kind === "ok"
        ? "bg-green-50 border-green-200 text-green-700"
        : "bg-rose-50 border-rose-200 text-rose-700",
    ].join(" ")}
  >
    <Image
      src={kind === "ok" ? "/icons/check.svg" : "/icons/warning.svg"}
      alt={kind === "ok" ? "✓" : "!"}
      width={12}
      height={12}
      style={{ width: "auto", height: "auto" }}
    />
    {children}
  </span>
);

// Break a semicolon/pipe/comma/• separated reason string into tokens
const splitReasons = (msg: string, bucket?: BucketKey): string[] => {
  const s = String(msg || "");
  return bucket === "Keywords"
    ? s
        .split(/[;•|]+/g)
        .map((t) => t.trim())
        .filter(Boolean) // Split on semicolon/pipe/bullet, but keep commas intact for keyword parsing
    : s
        .split(/[;•|,]+/g)
        .map((t) => t.trim())
        .filter(Boolean);
};

// Summary achievement checks (derived from feedback reasons produced on server)
const SUMMARY_CHECKS = [
  { key: "has summary", label: "Summary present" },
  { key: "years mentioned", label: "Years of experience" },
  {
    key: "quantified outcome",
    label: "Quantified outcome (%, $, volume, time)",
  },
  { key: "resume skill", label: "Mentions a skill from Skills section" },
];

// Parse feedback lines like:
// "Structure: 18/25 — ...", "Keywords: 7/7", "Summary: 12/20 — a; b"
const parseFeedback = (feedback: string[] = []): Bucket[] => {
  const re =
    /^([^:]+):\s*(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?(?:\s*[—–-]\s*(.*))?$/i;

  const parsed: Bucket[] = [];
  for (const raw of feedback) {
    const line = String(raw || "").trim();
    const m = re.exec(line);
    if (!m) continue;

    const key = toKey(m[1]);
    if (!key) continue;

    const gotRaw = Math.max(0, Math.round(parseFloat(m[2])));
    const maxRaw = m[3]
      ? Math.max(1, Math.round(parseFloat(m[3]!)))
      : DEFAULT_MAX[key];
    const msg = (m[4] || "").trim();

    const uiMax = DEFAULT_MAX[key];
    const gotScaled =
      maxRaw === uiMax
        ? gotRaw
        : Math.round((gotRaw / Math.max(1, maxRaw)) * uiMax);

    parsed.push({
      key,
      got: Math.max(0, Math.min(uiMax, gotScaled)),
      max: uiMax,
      message: msg,
    });
  }
  return parsed;
};

const barPct = (got: number, max: number) =>
  Math.max(0, Math.min(100, Math.round((got / Math.max(1, max)) * 100)));

const colorFor = (pct: number) =>
  pct >= 80
    ? "bg-green-500"
    : pct >= 60
    ? "bg-emerald-500"
    : pct >= 40
    ? "bg-amber-500"
    : "bg-red-500";

const EDU_COLOR = {
  green: {
    bg: "bg-green-50",
    border: "border-green-200",
    text: "text-green-800",
  },
  blue: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-800",
  },
  amber: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-800",
  },
  red: {
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-800",
  },
} as const;
type EduColorKey = keyof typeof EDU_COLOR;

// Improvement tips for each category
const IMPROVEMENT_TIPS: Record<BucketKey, string[]> = {
  Structure: [
    "Use clear section headings (Experience, Education, Skills)",
    "Maintain consistent formatting throughout",
    "Ensure proper spacing and alignment",
    "Use bullet points for readability",
    "Keep your resume to 1-2 pages maximum",
  ],
  Summary: [
    "Include 2-3 sentences at the top of your resume",
    "Mention your years of experience",
    "Highlight your key skills and achievements",
    "Include quantifiable results (numbers, percentages)",
    "Tailor it to the specific job you're applying for",
  ],
  Skills: [
    "Include both hard and soft skills",
    "Match skills to those mentioned in the job description",
    "Organize skills into categories if you have many",
    "Place most relevant skills near the top",
    "Include technical proficiencies and tools",
  ],
  Experience: [
    "Use action verbs to start each bullet point",
    "Focus on achievements rather than responsibilities",
    "Quantify your accomplishments with numbers",
    "Include relevant keywords from the job description",
    "Show career progression with increasing responsibility",
  ],
  Education: [
    "List your highest degree first",
    "Include relevant coursework for recent graduates",
    "Add certifications and professional development",
    "Mention honors or awards if applicable",
    "Include graduation year (or expected graduation)",
  ],
  Keywords: [
    "Carefully review the job description for important keywords",
    "Include both required and desirable keywords",
    "Use variations of keywords (e.g., 'manage', 'management', 'manager')",
    "Incorporate keywords naturally throughout your resume",
    "Highlight industry-specific terminology",
  ],
};

// Dynamic education feedback based on score
const getEducationFeedback = (
  score: number,
  max: number,
  educationGaps: string[] = []
) => {
  const percentage = (score / max) * 100;

  if (percentage >= 80) {
    return {
      message: "Excellent education section with all key information present",
      color: "green",
      icon: "✅",
      gapsMessage:
        educationGaps.length > 0
          ? "Minor gaps detected but overall strong education section"
          : "No significant education gaps detected",
    };
  } else if (percentage >= 60) {
    return {
      message: "Good education section but could use some improvements",
      color: "blue",
      icon: "ℹ️",
      gapsMessage:
        educationGaps.length > 0
          ? "Consider addressing these gaps to improve your score"
          : "Could be strengthened with additional details",
    };
  } else if (percentage >= 40) {
    return {
      message:
        "Education section needs significant improvements to meet job requirements",
      color: "amber",
      icon: "⚠️",
      gapsMessage:
        educationGaps.length > 0
          ? "These gaps are significantly impacting your score"
          : "Consider adding relevant education details or certifications",
    };
  } else {
    return {
      message:
        "Education section is missing critical information required for this role",
      color: "red",
      icon: "❌",
      gapsMessage:
        educationGaps.length > 0
          ? "These critical gaps are preventing you from qualifying"
          : "Review the job requirements and add missing education credentials",
    };
  }
};

// Additional recommendations based on education score
const getEducationRecommendations = (score: number, max: number) => {
  const percentage = (score / max) * 100;

  if (percentage >= 80) {
    return [
      "Consider adding any recent professional development or certifications",
      "Highlight academic honors or awards if you haven't already",
      "Ensure your education is properly highlighted in your summary section",
    ];
  } else if (percentage >= 60) {
    return [
      "Add any missing degrees or certifications mentioned in the job description",
      "Include relevant coursework if you're a recent graduate",
      "Consider professional certifications to strengthen your qualifications",
    ];
  } else if (percentage >= 40) {
    return [
      "Identify key education requirements from the job description and address gaps",
      "Consider online courses or certifications to meet minimum requirements",
      "Highlight relevant training or workshops that demonstrate required knowledge",
    ];
  } else {
    return [
      "Review the job description carefully for education requirements",
      "Consider if you have equivalent experience that can compensate for education gaps",
      "Look for alternative certifications or training programs to meet minimum qualifications",
    ];
  }
};

type Props = {
  details: ATSDetails | number | null | undefined;
  resumeSkills?: string[];
  quantifiedExamples?: string[];
  jdMatchedCore?: string[];
  jdMissingRequired?: string[];
  jdMissingDesirable?: string[];
  educationGaps?: string[];
  educationItems?: Array<{
    name: string;
    institution?: string;
    year?: string;
  }>;
};

const ATSBreakdown: React.FC<Props> = ({
  details,
  resumeSkills = [],
  quantifiedExamples = [],
  jdMatchedCore = [],
  jdMissingRequired = [],
  jdMissingDesirable = [],
  educationGaps = [],
  educationItems = [],
}) => {
  const serverScore =
    typeof details === "number" ? details : details?.score ?? 0;

  const serverKw =
    details && typeof details === "object" ? details.keywords : undefined;

  const cleanMatched = useMemo(() => {
    // Use AI's evidence if available, otherwise fall back to deterministic
    const aiMatched =
      details &&
      typeof details === "object" &&
      details.jobFitScore?.debug?.evidencePreview?.matched;

    if (aiMatched && aiMatched.length > 0) {
      return aiMatched.map((item) => item.item).filter(Boolean);
    }

    return (serverKw?.matched ?? jdMatchedCore ?? [])
      .map(cleanKeyword)
      .filter((k) => k.length > 2);
  }, [serverKw, jdMatchedCore, details]);

  const cleanMissingRequired = useMemo(() => {
    // Use AI's evidence if available, otherwise fall back to deterministic
    const aiMissing =
      details &&
      typeof details === "object" &&
      details.jobFitScore?.debug?.evidencePreview?.missing;

    if (aiMissing && aiMissing.length > 0) {
      return aiMissing.map((item) => item.item).filter(Boolean);
    }

    return (serverKw?.missing ?? jdMissingRequired ?? [])
      .map(cleanKeyword)
      .filter((k) => k.length > 2);
  }, [serverKw, jdMissingRequired, details]);

  const cleanMissingDesirable = useMemo(
    () =>
      (jdMissingDesirable || []).map(cleanKeyword).filter((k) => k.length > 2),
    [jdMissingDesirable]
  );

  // Prefer server breakdown; merge in parsed feedback messages so "Signals detected" can show.
  const buckets = useMemo<Bucket[]>(() => {
    const fb =
      details && typeof details === "object" && Array.isArray(details.feedback)
        ? details.feedback
        : [];
    const parsedFb = parseFeedback(fb);
    const msgMap = new Map(parsedFb.map((b) => [b.key, b.message]));

    if (
      details &&
      typeof details === "object" &&
      Array.isArray(details.breakdown) &&
      details.breakdown.length
    ) {
      const map = new Map<BucketKey, Bucket>();
      for (const item of details.breakdown) {
        const key = toKey(item.label);
        if (!key) continue;
        const max = item.max ?? DEFAULT_MAX[key];
        const got = Math.max(0, Math.min(max, Math.round(item.score ?? 0)));
        // take message from feedback if available
        map.set(key, {
          key,
          got,
          max,
          message: msgMap.get(key) || "",
        });
      }
      return BUCKET_ORDER.map(
        (k) =>
          map.get(k) ?? {
            key: k,
            got: 0,
            max: DEFAULT_MAX[k],
            message: msgMap.get(k) || "",
          }
      );
    }

    // Fallback: only feedback present → build from feedback
    const parsed = parsedFb;
    const map = new Map(parsed.map((b) => [b.key, b]));
    return BUCKET_ORDER.map(
      (k) => map.get(k) ?? { key: k, got: 0, max: DEFAULT_MAX[k], message: "" }
    );
  }, [details]);

  // Headline score = sum of buckets if available; else serverScore
  const headlineScore = useMemo(() => {
    if (!buckets.length) return serverScore;
    const sum = buckets.reduce((t, b) => t + Math.min(b.got, b.max), 0);
    return Math.max(0, Math.min(100, sum));
  }, [buckets, serverScore]);

  // Clean skills for pills (trim + drop empties)
  const skillsPills = useMemo(
    () =>
      (resumeSkills || [])
        .map((s) => (s ?? "").toString().trim())
        .filter(Boolean),
    [resumeSkills]
  );

  useEffect(() => {
    console.groupCollapsed("📊 ATS Breakdown — parsed");
    debug("Server details:", details);
    debug("Buckets:", buckets);
    debug("headlineScore:", headlineScore, "serverScore:", serverScore);
    console.groupEnd();
  }, [details, buckets, headlineScore, serverScore]);

  const theme = serverScore > 69 ? "good" : serverScore > 49 ? "warn" : "bad";
  const iconSrc =
    theme === "good"
      ? "/icons/ats-good.svg"
      : theme === "warn"
      ? "/icons/ats-warning.svg"
      : "/icons/ats-bad.svg";
  const gradient =
    theme === "good"
      ? "from-green-100"
      : theme === "warn"
      ? "from-yellow-100"
      : "from-red-100";

  const containerClass =
    `rounded-2xl shadow-md w-full bg-gradient-to-b to-light-white ` +
    `p-6 sm:p-8 flex flex-col gap-4 ${gradient}`;

  return (
    <section className={containerClass}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image
            src={iconSrc}
            alt="ATS"
            width={50}
            height={50}
            style={{ width: "auto", height: "auto" }}
          />
          <div className="flex flex-col">
            <h3 className="text-3xl font-semibold">
              ATS Score: <span>{serverScore}/100</span>
            </h3>
            <p className="text-sm text-gray-600">
              It is the weighted score of the six categories. Boost the biggest
              gaps first.
            </p>
          </div>
        </div>
      </div>

      {/* Accordion per bucket */}
      <Accordion type="single" collapsible className="w-full space-y-3">
        {buckets.map((b) => {
          const pct = barPct(b.got, b.max);
          const pointsLost = b.max - b.got;

          // Get dynamic education feedback
          const educationFeedback =
            b.key === "Education"
              ? getEducationFeedback(b.got, b.max, educationGaps)
              : null;

          const educationRecommendations =
            b.key === "Education"
              ? getEducationRecommendations(b.got, b.max)
              : [];

          return (
            <AccordionItem
              key={b.key}
              value={b.key}
              className="border rounded-lg bg-white px-3 sm:px-4"
            >
              <AccordionTrigger className="hover:no-underline py-3">
                <div className="flex w-full items-center justify-between">
                  <div className="font-medium">{b.key}</div>
                  <div className="text-sm text-gray-700">
                    <span className="font-semibold">{b.got}</span> / {b.max}
                  </div>
                </div>
              </AccordionTrigger>

              <AccordionContent className="pb-4">
                {/* progress bar */}
                <div
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${b.key} ${pct}%`}
                  className="w-full h-2 rounded bg-gray-100 overflow-hidden mb-2"
                >
                  <div
                    className={`h-2 ${colorFor(pct)}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {/* Points deduction explanation */}
                {pointsLost > 0 && (
                  <div className="mb-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <h5 className="text-sm font-semibold text-amber-800 mb-1">
                      Why points were deducted:
                    </h5>
                    <p className="text-sm text-amber-700">
                      {b.key === "Structure" &&
                        `Your resume lost ${pointsLost} point${
                          pointsLost !== 1 ? "s" : ""
                        } because it could be better organized with clearer section headings, more consistent formatting, or improved readability.`}
                      {b.key === "Summary" &&
                        `Your resume lost ${pointsLost} point${
                          pointsLost !== 1 ? "s" : ""
                        } because your professional summary is missing key elements like quantifiable achievements or relevant skills.`}
                      {b.key === "Skills" &&
                        `Your resume lost ${pointsLost} point${
                          pointsLost !== 1 ? "s" : ""
                        } because it's missing some important skills from the job description or doesn't showcase your skills effectively.`}
                      {b.key === "Experience" &&
                        `Your resume lost ${pointsLost} point${
                          pointsLost !== 1 ? "s" : ""
                        } because your experience section could better highlight achievements with quantifiable results and action verbs.`}
                      {b.key === "Education" &&
                        `Your resume lost ${pointsLost} point${
                          pointsLost !== 1 ? "s" : ""
                        } because it's missing key education details required by the job description.`}
                      {b.key === "Keywords" &&
                        `Your resume lost ${pointsLost} point${
                          pointsLost !== 1 ? "s" : ""
                        } because it's missing some important keywords from the job description.`}
                    </p>
                  </div>
                )}

                {/* Dynamic guidance (no static text) */}
                {(() => {
                  const reasons = splitReasons(b.message, b.key);

                  // Debug logging for Keywords bucket (can be removed in production)
                  if (b.key === "Keywords") {
                    debug("🔍 Keywords bucket debug:", {
                      message: b.message,
                      reasons: reasons,
                      reasonCount: reasons.length,
                    });
                  }

                  // Special handling for Summary: show Achieved vs Missing based on reasons
                  const isSummary = b.key === "Summary";
                  const achieved: string[] = [];
                  const missing: string[] = [];

                  if (isSummary) {
                    const reasonSet = new Set(
                      reasons.map((r) => r.toLowerCase())
                    );
                    SUMMARY_CHECKS.forEach((c) => {
                      // Check for positive indicators and avoid negative ones
                      const hit = [...reasonSet].some((x) => {
                        const hasKey = x.includes(c.key);
                        if (!hasKey) return false;

                        // Check for negative indicators (expanded list)
                        const hasNegative =
                          /\b(no|not|missing|lacks?|absent|but lacks|without|fails? to|doesn't|don't)\b/i.test(
                            x
                          );

                        // Check for positive indicators (expanded list)
                        const hasPositive =
                          /\b(yes|present|has|includes?|contains?|mentions?|and mentions|with|features?|shows?|demonstrates?)\b/i.test(
                            x
                          );

                        // Special handling for different key types
                        if (c.key === "has summary") {
                          // Look for "includes a summary", "has summary", "summary present"
                          return (
                            x.includes("summary") &&
                            (hasPositive || !hasNegative)
                          );
                        }

                        if (c.key === "years mentioned") {
                          // Look for "years", "experience", "tenure"
                          return (
                            (x.includes("years") || x.includes("experience")) &&
                            (hasPositive || !hasNegative)
                          );
                        }

                        if (c.key === "quantified outcome") {
                          // Look for "quantified", "metrics", "numbers", "outcomes"
                          return (
                            (x.includes("quantified") ||
                              x.includes("metrics") ||
                              x.includes("outcomes")) &&
                            (hasPositive || !hasNegative)
                          );
                        }

                        if (c.key === "resume skill") {
                          // Look for "skills", "mentions relevant skills"
                          return (
                            x.includes("skill") && (hasPositive || !hasNegative)
                          );
                        }

                        // Default logic: if we have the key and either:
                        // 1. No negative indicators are present, OR
                        // 2. Positive indicators are present
                        return !hasNegative || hasPositive;
                      });
                      (hit ? achieved : missing).push(c.label);
                    });
                  }

                  return (
                    <>
                      {/* If any reasons exist, show them as neutral "Signals detected" (optional) */}
                      {/* Skip Key Findings for Skills bucket since we have a better Skills section below */}
                      {!!reasons.length && !isSummary && b.key !== "Skills" && (
                        <div className="mt-2">
                          <h5 className="text-sm font-semibold text-gray-800 mb-1">
                            Key Findings
                          </h5>
                          <div className="space-y-2">
                            {reasons.map((r, i) => {
                              // Debug: log all reasons for Keywords bucket (can be removed in production)
                              if (b.key === "Keywords") {
                                debug(`🔍 Reason ${i}:`, {
                                  original: r,
                                  lowercased: r.toLowerCase(),
                                  hasMissing: r
                                    .toLowerCase()
                                    .includes("missing:"),
                                });
                              }

                              // Check if this is a "missing:" line (case insensitive)
                              if (r.toLowerCase().includes("missing:")) {
                                // Find the "missing:" part (case insensitive) and extract everything after it
                                const missingIndex = r
                                  .toLowerCase()
                                  .indexOf("missing:");
                                const missingText =
                                  missingIndex >= 0
                                    ? r
                                        .substring(
                                          missingIndex + "missing:".length
                                        )
                                        .trim()
                                    : "";
                                const keywords = missingText
                                  .split(",")
                                  .map((k) => k.trim())
                                  .filter((k) => k.length > 0);

                                // Debug logging for missing keywords (can be removed in production)
                                debug("🔍 Missing keywords debug:", {
                                  originalReason: r,
                                  missingText: missingText,
                                  keywords: keywords,
                                  keywordCount: keywords.length,
                                });

                                return (
                                  <div key={i}>
                                    <div className="text-sm font-semibold text-gray-800 mb-2">
                                      ❌ Missing Keywords ({keywords.length})
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      {keywords.map((keyword, idx) => (
                                        <span
                                          key={`missing-keyword-${idx}`}
                                          className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 text-red-700 px-2 py-1 text-xs font-medium"
                                        >
                                          <Image
                                            src="/icons/cross.svg"
                                            alt="✗"
                                            width={12}
                                            height={12}
                                          />
                                          {keyword
                                            .split(" ")
                                            .map(
                                              (word) =>
                                                word.charAt(0).toUpperCase() +
                                                word.slice(1).toLowerCase()
                                            )
                                            .join(" ")}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                );
                              } else if (
                                r.toLowerCase().includes("matches") &&
                                r.toLowerCase().includes("keywords")
                              ) {
                                // Handle the "Matches X% of Job Description keywords" case
                                return (
                                  <div
                                    key={i}
                                    className="text-sm text-gray-700"
                                  >
                                    {r
                                      .split(" ")
                                      .map((word) => {
                                        // Keep certain words lowercase
                                        const lowercaseWords = [
                                          "of",
                                          "and",
                                          "or",
                                          "the",
                                          "a",
                                          "an",
                                          "in",
                                          "on",
                                          "at",
                                          "to",
                                          "for",
                                          "with",
                                          "by",
                                        ];
                                        if (
                                          lowercaseWords.includes(
                                            word.toLowerCase()
                                          )
                                        ) {
                                          return word.toLowerCase();
                                        }
                                        // Capitalize first letter of other words
                                        return (
                                          word.charAt(0).toUpperCase() +
                                          word.slice(1).toLowerCase()
                                        );
                                      })
                                      .join(" ")}
                                  </div>
                                );
                              }

                              // Special handling for Experience bucket - convert technical terms to user-friendly language
                              if (b.key === "Experience") {
                                let userFriendlyText = r;

                                // Convert technical terms to user-friendly language
                                userFriendlyText = userFriendlyText.replace(
                                  /(\d+)\s*Action\s*Verbs?/gi,
                                  "$1 strong action words (like 'managed', 'led', 'achieved')"
                                );

                                userFriendlyText = userFriendlyText.replace(
                                  /(\d+)\s*Quantified\s*Metrics?/gi,
                                  "$1 quantified achievements (with numbers, percentages, or results)"
                                );

                                const formattedText = userFriendlyText
                                  .split(" ")
                                  .map((word) => {
                                    // Keep certain words lowercase
                                    const lowercaseWords = [
                                      "of",
                                      "and",
                                      "or",
                                      "the",
                                      "a",
                                      "an",
                                      "in",
                                      "on",
                                      "at",
                                      "to",
                                      "for",
                                      "with",
                                      "by",
                                    ];
                                    if (
                                      lowercaseWords.includes(
                                        word.toLowerCase()
                                      )
                                    ) {
                                      return word.toLowerCase();
                                    }
                                    // Capitalize first letter of other words
                                    return (
                                      word.charAt(0).toUpperCase() +
                                      word.slice(1).toLowerCase()
                                    );
                                  })
                                  .join(" ");

                                return (
                                  <div
                                    key={i}
                                    className="flex items-center gap-2 text-sm text-gray-700"
                                  >
                                    <span className="text-green-500 font-medium">
                                      ✓
                                    </span>
                                    <span>{formattedText}</span>
                                  </div>
                                );
                              }

                              // Special handling for Structure bucket - add arrow signs
                              if (b.key === "Structure") {
                                const formattedText = r
                                  .split(" ")
                                  .map((word) => {
                                    // Keep certain words lowercase
                                    const lowercaseWords = [
                                      "of",
                                      "and",
                                      "or",
                                      "the",
                                      "a",
                                      "an",
                                      "in",
                                      "on",
                                      "at",
                                      "to",
                                      "for",
                                      "with",
                                      "by",
                                    ];
                                    if (
                                      lowercaseWords.includes(
                                        word.toLowerCase()
                                      )
                                    ) {
                                      return word.toLowerCase();
                                    }
                                    // Capitalize first letter of other words
                                    return (
                                      word.charAt(0).toUpperCase() +
                                      word.slice(1).toLowerCase()
                                    );
                                  })
                                  .join(" ");

                                return (
                                  <div
                                    key={i}
                                    className="flex items-center gap-2 text-sm text-gray-700"
                                  >
                                    <span className="text-blue-500 font-medium">
                                      →
                                    </span>
                                    <span>{formattedText}</span>
                                  </div>
                                );
                              }

                              // Format other text with proper case
                              const formattedText = r
                                .split(" ")
                                .map((word) => {
                                  // Keep certain words lowercase
                                  const lowercaseWords = [
                                    "of",
                                    "and",
                                    "or",
                                    "the",
                                    "a",
                                    "an",
                                    "in",
                                    "on",
                                    "at",
                                    "to",
                                    "for",
                                    "with",
                                    "by",
                                  ];
                                  if (
                                    lowercaseWords.includes(word.toLowerCase())
                                  ) {
                                    return word.toLowerCase();
                                  }
                                  // Capitalize first letter of other words
                                  return (
                                    word.charAt(0).toUpperCase() +
                                    word.slice(1).toLowerCase()
                                  );
                                })
                                .join(" ");

                              return (
                                <div key={i} className="text-sm text-gray-700">
                                  {formattedText}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Summary → pill tags */}
                      {isSummary &&
                        (achieved.length > 0 || missing.length > 0) && (
                          <div className="mt-4 space-y-3">
                            {achieved.length > 0 && (
                              <div>
                                <h5 className="text-sm font-semibold text-green-800 mb-2">
                                  ✅ Achieved:
                                </h5>
                                <div className="flex flex-wrap gap-2">
                                  {achieved.map((it, i) => (
                                    <Pill key={`ok-${i}`} kind="ok">
                                      {it}
                                    </Pill>
                                  ))}
                                </div>
                              </div>
                            )}
                            {missing.length > 0 && (
                              <div>
                                <h5 className="text-sm font-semibold text-rose-800 mb-2">
                                  ❌ Missing:
                                </h5>
                                <div className="flex flex-wrap gap-2">
                                  {missing.map((it, i) => (
                                    <Pill key={`miss-${i}`} kind="miss">
                                      {it}
                                    </Pill>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                    </>
                  );
                })()}

                {/* Improvement tips for all sections */}
                <div className="mt-4">
                  <h5 className="text-sm font-semibold text-blue-800 mb-2">
                    💡 How to improve your {b.key} score:
                  </h5>
                  <ul className="text-sm text-gray-700 list-disc pl-5">
                    {IMPROVEMENT_TIPS[b.key].map((tip, i) => (
                      <li key={i}>{tip}</li>
                    ))}
                  </ul>
                </div>

                {/* Education Section - Dynamic feedback based on score */}
                {b.key === "Education" &&
                  educationFeedback &&
                  (() => {
                    // Debug logging for education items
                    debug("🔍 Education section debug:", {
                      educationItems: educationItems,
                      length: educationItems?.length || 0,
                      hasItems: (educationItems?.length || 0) > 0,
                    });

                    const colorKey = educationFeedback.color as EduColorKey;
                    const C = EDU_COLOR[colorKey];

                    return (
                      <div className="mt-4">
                        <h5 className="text-sm font-semibold text-gray-800 mb-2">
                          Education Analysis
                        </h5>

                        {/* Show score explanation */}
                        <div
                          className={`mb-4 p-3 ${C.bg} rounded-lg border ${C.border}`}
                        >
                          <p className={`text-sm ${C.text}`}>
                            <strong>
                              {educationFeedback.icon} Your score: {b.got}/
                              {b.max}
                            </strong>{" "}
                            - {educationFeedback.message}
                          </p>
                        </div>

                        {/* Education Gaps - Show what's missing */}
                        {educationGaps && educationGaps.length > 0 ? (
                          <div>
                            <h6
                              className={`text-sm font-semibold ${C.text} mb-2`}
                            >
                              ⚠️ Education Gaps ({educationGaps.length})
                            </h6>
                            <p className="text-sm text-gray-600 mb-2">
                              {educationFeedback.gapsMessage}:
                            </p>
                            <ul className="text-sm text-gray-700 list-disc pl-5 mb-3">
                              {educationGaps.map((gap, i) => (
                                <li key={`edu-gap-${i}`}>{gap}</li>
                              ))}
                            </ul>
                          </div>
                        ) : (
                          <div
                            className={`p-3 ${C.bg} rounded-lg border ${C.border}`}
                          >
                            <p className={`text-sm ${C.text}`}>
                              {educationFeedback.icon}{" "}
                              {educationFeedback.gapsMessage}
                            </p>
                          </div>
                        )}

                        {/* Additional recommendations based on score */}
                        {educationRecommendations.length > 0 && (
                          <div className="mt-4">
                            <h6 className="text-sm font-semibold text-purple-800 mb-2">
                              🎓 Recommendations for Improvement
                            </h6>
                            <ul className="text-sm text-gray-700 list-disc pl-5">
                              {educationRecommendations.map((rec, i) => (
                                <li key={`edu-rec-${i}`}>{rec}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Education Items Display */}
                        {educationItems && educationItems.length > 0 && (
                          <div className="mt-4">
                            <h6 className="text-sm font-semibold text-gray-800 mb-2">
                              🎓 Education & Certifications (
                              {educationItems.length} items):
                            </h6>
                            <div className="space-y-2">
                              {educationItems.map((item, i) => {
                                // Determine icon based on education type
                                const isDegree =
                                  /bachelor|master|phd|doctorate|degree|university|college/i.test(
                                    item.name
                                  );
                                const isCertification =
                                  /certificate|certification|bootcamp|course|training|udemy|coursera|linkedin/i.test(
                                    item.name
                                  );

                                let icon = "📚"; // Default
                                if (isDegree) icon = "🎓";
                                else if (isCertification) icon = "🏆";

                                return (
                                  <div
                                    key={`edu-item-${i}`}
                                    className="flex items-start gap-3 text-sm text-gray-700"
                                  >
                                    <span className="text-lg mt-0.5">
                                      {icon}
                                    </span>
                                    <div className="flex-1">
                                      <div className="font-medium text-gray-900">
                                        {item.name}
                                      </div>
                                      {(item.institution || item.year) && (
                                        <div className="text-gray-600 text-xs">
                                          {item.institution}
                                          {item.institution &&
                                            item.year &&
                                            ` • `}
                                          {item.year}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                {b.key === "Skills" && skillsPills.length > 0 && (
                  <div className="mt-3">
                    <h5 className="text-sm font-semibold text-gray-800 mb-2">
                      ✅ Skills detected in your resume ({skillsPills.length}{" "}
                      skills found):
                    </h5>
                    <div className="flex flex-wrap gap-2">
                      {skillsPills.map((skill, i) => (
                        <span
                          key={`${skill}-${i}`}
                          className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 text-green-700 px-2 py-1 text-xs font-medium"
                        >
                          <Image
                            src="/icons/check.svg"
                            alt="✓"
                            width={12}
                            height={12}
                            style={{ width: "auto", height: "auto" }}
                          />
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {b.key === "Experience" &&
                  (() => {
                    // Debug logging for quantified examples
                    debug("🔍 Experience section debug:", {
                      quantifiedExamples: quantifiedExamples,
                      length: quantifiedExamples.length,
                      hasExamples: quantifiedExamples.length > 0,
                    });

                    return (
                      <div className="mt-3">
                        {quantifiedExamples.length > 0 ? (
                          <div>
                            <h5 className="text-sm font-semibold text-gray-800 mb-2">
                              📊 Quantified achievements found in your
                              experience ({quantifiedExamples.length} examples):
                            </h5>
                            <div className="space-y-2">
                              {quantifiedExamples.map((ex, i) => (
                                <div
                                  key={`qex-${i}`}
                                  className="flex items-start gap-2 text-sm text-gray-700"
                                >
                                  <span className="text-blue-500 font-medium mt-0.5">
                                    →
                                  </span>
                                  <span>
                                    {ex
                                      .split(
                                        /(\d+%|\d+\.\d+%|\d+\s*percent|\$\d+[KM]?|\d+[KM]?\s*(dollars|USD)|\d+\s*(years?|months?|days?|hours?|people|team members?|clients?|projects?))/i
                                      )
                                      .map((part, idx) => {
                                        // Check if this part is a meaningful quantified result
                                        const isQuantified = /(\d+%|\d+\.\d+%|\d+\s*percent|\$\d+[KM]?|\d+[KM]?\s*(dollars|USD)|\d+\s*(years?|months?|days?|hours?|people|team members?|clients?|projects?))/i.test(part);
                                        
                                        if (isQuantified) {
                                          return (
                                            <strong
                                              key={idx}
                                              className="font-semibold text-gray-900 bg-yellow-100 px-1 rounded"
                                            >
                                              {part}
                                            </strong>
                                          );
                                        }
                                        return part;
                                      })}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-gray-600 italic">
                            💡 Tip: Add more quantified achievements with
                            specific numbers, percentages, or results to
                            strengthen your experience section.
                          </div>
                        )}
                      </div>
                    );
                  })()}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </section>
  );
};

export default ATSBreakdown;
