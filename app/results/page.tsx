"use client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { usePathname } from "next/navigation";
import ATSBreakdown, { type ATSDetails } from "../../components/Ats";
import ScoreChart from "../../components/ScoreChart";
import { Button } from "@/components/ui/button";
import ResumeAnalysisPDF from "../../components/ResumeAnalysisPDF";
import { pdf } from "@react-pdf/renderer";

/* =========================
   Build fingerprint
   ========================= */
const __RESULTS_BUILD_ID__ = "results-v11";
const DEBUG = process.env.NODE_ENV === "development";

/* Dev-only: log once per key (avoids StrictMode double logs) */
const dlogOnce = (() => {
  const seen = new Set<string>();
  return (key: string, ...args: any[]) => {
    if (!DEBUG || seen.has(key)) return;
    seen.add(key);
    // eslint-disable-next-line no-console
    console.log(...args);
  };
})();

/* =========================
   LoadingDots
   ========================= */
const LoadingDots = () => (
  <motion.div className="flex space-x-1">
    {[0, 1, 2].map((i) => (
      <motion.div
        key={i}
        className="w-2 h-2 bg-gray-600 rounded-full"
        animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
      />
    ))}
  </motion.div>
);

/* =========================
   Types (aligned with API)
   ========================= */
type PackExperience = {
  employer: string;
  title: string;
  location?: string;
  start?: string;
  end?: string;
  bullets: string[];
};

type PackProject = {
  name: string;
  context?: string;
  tools?: string[];
  bullets: string[];
};

type PackEducation = { name: string; institution?: string; year?: string };

type AnalysisLists = {
  strengths: string[];
  improvements: string[];
  gaps: string[];
  recommendations: string[];
  overallSummary: string;
};

type StructuredPack = {
  professionalSummary: string;
  keySkills: string[];
  professionalExperience: PackExperience[];
  keyProjects?: PackProject[];
  educationAndCertification: PackEducation[];
  toolsAndTechnologies: string[];
};

/* ==== Job Fit score types ==== */
type JobFitBuckets = {
  mustHave: number;
  coreSkills: number;
  domainTitleAdjacency: number;
  seniority: number;
  recency: number;
  niceToHaves: number;
};
type JobFitGates = {
  mustHaveCap?: number;
  domainCap?: number;
  reasons: string[];
};
type JobFitDebug = {
  jdProfession: string;
  resumeProfession: string;
  mustHaves: string[];
  matchedMustHaves: string[];
  missingMustHaves: string[];
  coreReqs: string[];
  coreMatched: string[];
  coreMissing: string[];
  reqYears?: number | null;
  resYears?: number | null;
  recentMentions: string[];
};
type JobFitScore = {
  score: number;
  raw: number;
  buckets: JobFitBuckets;
  gates: JobFitGates;
  debug: JobFitDebug;
};
type ATSScorePayload =
  | number
  | {
      score: number;
      feedback?: string[];
      breakdown?: Array<{ label: string; score: number; max: number }>;
    };

interface AnalysisData {
  success: boolean;
  analysis: {
    atsScore: ATSScorePayload;
    matchScore?: number;
    jobFitScore?: JobFitScore | number;
    overallScore?: number;
    text: string;
    pack?: StructuredPack;
    analysisLists?: AnalysisLists;
    meta?: {
      profession?: string;
      counts?: { resumeSkills: number; jobRequirements: number };
      companyName?: string;
      jobTitle?: string;
    };
  };
  message: string;
}

interface ParsedAnalysis {
  strengths: string;
  opportunities: string;
  gaps: string;
  recommendations: string;
  summary: string;
  professionalSummary: string;
  keySkills: string;
  professionalExperience: string;
  keyProjects?: string;
  educationAndCertification: string;
  toolsAndTechnologies: string;
}

/* =========================
   Markdown parser (fallback)
   ========================= */
function parseAllSections(text: string) {
  const normalized = (text || "").replace(/\r\n/g, "\n").trim();
  const map: Record<string, string> = {};
  const re = /^###\s+(.+?)\s*\n([\s\S]*?)(?=^###\s+|^\s*$)/gim;
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized)) !== null) {
    const heading = m[1].trim().toLowerCase();
    const content = m[2].trim();
    map[heading] = content;
  }
  return {
    strengths: map["strengths"] ?? "",
    opportunities: map["opportunities to improve"] ?? map["weaknesses"] ?? "",
    gaps: map["gaps"] ?? "",
    recommendations: map["recommendations"] ?? "",
    summary: map["overall summary"] ?? "",
    professionalSummary: map["professional summary"] ?? "",
    keySkills: map["key skills"] ?? "",
    professionalExperience: map["professional experience"] ?? "",
    keyProjects: map["key projects"] ?? "",
    educationAndCertification:
      map["education & certification"] ??
      map["education and certification"] ??
      map["education & certifications"] ??
      map["education and certifications"] ??
      "",
    toolsAndTechnologies:
      map["tools & technologies"] ?? map["tools and technologies"] ?? "",
  };
}

/* =========================
   Prefer structured pack if present
   ========================= */
function toParsedFromPack(
  pack: StructuredPack,
  lists?: AnalysisLists
): ParsedAnalysis {
  const exp = (pack.professionalExperience || [])
    .map((r) => {
      const hdr = `**${r.title || ""} — ${r.employer || ""}${
        r.location ? `, ${r.location}` : ""
      }${
        r.start || r.end
          ? ` (${[r.start, r.end].filter(Boolean).join(" – ")})`
          : ""
      }**`;
      const bullets = (r.bullets || []).map((b) => `- ${b}`).join("\n");
      return [hdr, bullets].filter(Boolean).join("\n");
    })
    .join("\n\n");

  const projects = (pack.keyProjects || [])
    .map((p) => {
      const hdr = `**${p.name}${p.context ? ` — ${p.context}` : ""}**`;
      const tools =
        p.tools && p.tools.length ? `*Tools:* ${p.tools.join(", ")}` : "";
      const bullets = (p.bullets || []).map((b) => `- ${b}`).join("\n");
      return [hdr, tools, bullets].filter(Boolean).join("\n");
    })
    .join("\n\n");

  const edu = (pack.educationAndCertification || [])
    .map((e) => [e.name, e.institution, e.year].filter(Boolean).join(" — "))
    .map((line) => `- ${line}`)
    .join("\n");

  return {
    strengths: (lists?.strengths || []).map((s) => `- ${s}`).join("\n"),
    opportunities: (lists?.improvements || []).map((s) => `- ${s}`).join("\n"),
    gaps: (lists?.gaps || []).map((s) => `- ${s}`).join("\n"),
    recommendations: (lists?.recommendations || [])
      .map((s) => `- ${s}`)
      .join("\n"),
    summary: lists?.overallSummary || "",
    professionalSummary: pack.professionalSummary || "",
    keySkills: (pack.keySkills || []).map((k) => `- ${k}`).join("\n"),
    professionalExperience: exp || "",
    keyProjects: projects || "",
    educationAndCertification: edu || "",
    toolsAndTechnologies: (pack.toolsAndTechnologies || [])
      .map((t) => `- ${t}`)
      .join("\n"),
  };
}

/* =========================
   Score helpers + JD normaliser
   ========================= */
function clamp100(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeJDItems(items: string[]): string[] {
  const out: string[] = [];
  let buf: string[] = [];
  let open = false;

  for (const raw of items) {
    const s = String(raw || "").trim();
    if (!s) continue;
    const opens = s.includes("(") && !s.includes(")");
    const closes = s.includes(")");

    if (open) {
      buf.push(s);
      if (closes) {
        const joined = buf.join(" ").replace(/\s+/g, " ");
        out.push(joined.replace(/\s*-\s*desirable\.?$/i, "").trim());
        buf = [];
        open = false;
      }
      continue;
    }
    if (opens && !closes) {
      buf = [s];
      open = true;
      continue;
    }
    out.push(s.replace(/\s*-\s*desirable\.?$/i, "").trim());
  }
  if (buf.length) out.push(buf.join(" ").replace(/\s+/g, " ").trim());

  const seen = new Set<string>();
  return out.filter((x) => (seen.has(x) ? false : (seen.add(x), true)));
}
function isEducationLine(s: string) {
  return /tertiary|qualification|degree|bachelor|masters|phd/i.test(s);
}

/* =========================
   Quantified bullet extractor
   ========================= */
function extractQuantifiedExamples(bullets: string[], limit = 3): string[] {
  // Enhanced regex to catch more types of quantified achievements
  const metricRe =
    /(\d+(?:\.\d+)?%|\$[\d,]+(?:\.\d+)?[MBK]?\b|\d+(?:\.\d+)?\s?(?:k|m|b)\b|\d+\s+(?:hours?|days?|weeks?|months?|years?)|[1-9]\d{2,}|\d+\s*(?:people|users|customers|clients|projects|teams|employees|members|staff|workers))/i;
  return bullets.filter((b) => metricRe.test(b)).slice(0, limit);
}

/* =========================
   Small helpers
   ========================= */
function mdListToArray(md: string): string[] {
  return (md || "")
    .split("\n")
    .map((s) => s.replace(/^[\s-•]+/, "").trim())
    .filter(Boolean);
}

/* =========================
   ATS normalizer (always object)
   ========================= */
function toATSDetails(
  atsRaw: ATSScorePayload | undefined,
  coreMissing: string[],
  parsed: ParsedAnalysis | null,
  pack?: StructuredPack
): ATSDetails {
  const score =
    typeof atsRaw === "number"
      ? clamp100(atsRaw)
      : clamp100(atsRaw?.score ?? 0);

  const feedback: string[] =
    typeof atsRaw === "object" && Array.isArray(atsRaw?.feedback)
      ? atsRaw.feedback
      : [];

  // If feedback is incomplete, generate missing feedback from breakdown data
  const breakdown =
    typeof atsRaw === "object" && Array.isArray(atsRaw?.breakdown)
      ? atsRaw.breakdown
      : [];

  const completeFeedback = breakdown.map((item) => {
    const existingFeedback = feedback.find((f) =>
      f.toLowerCase().startsWith(item.label.toLowerCase())
    );
    if (existingFeedback) {
      return existingFeedback;
    }
    // Generate fallback feedback for missing categories
    return `${item.label}: ${item.score}/${item.max}`;
  });

  const finalFeedback =
    completeFeedback.length > 0 ? completeFeedback : feedback;

  const processedBreakdown =
    typeof atsRaw === "object" && Array.isArray(atsRaw?.breakdown)
      ? atsRaw.breakdown.map((b) => ({
          label: String(b.label),
          score: Math.max(0, Math.round(Number(b.score))),
          max: Math.max(1, Math.round(Number(b.max))),
        }))
      : undefined;

  return {
    score,
    feedback: finalFeedback,
    breakdown: processedBreakdown,
    __coreMissing: coreMissing,
  } as ATSDetails;
}

/* =========================
   Component
   ========================= */
const ResultsPage = () => {
  const pathname = usePathname();
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [parsedAnalysis, setParsedAnalysis] = useState<ParsedAnalysis | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);

  // const downloadPDFReport = async (analysisData) => {
  //   try {
  //     // 1. Create the PDF blob
  //     const blob = await pdf(
  //       <ResumeAnalysisPDF analysisData={analysisData} />
  //     ).toBlob();

  //     // 2. Create download link
  //     const url = URL.createObjectURL(blob);
  //     const link = document.createElement("a");
  //     link.href = url;

  //     // 3. Set proper PDF filename
  //     const timestamp = new Date().getTime();
  //     link.download = `Resume_Analysis_Report_${timestamp}.pdf`;

  //     // 4. Trigger download
  //     document.body.appendChild(link);
  //     link.click();

  //     // 5. Clean up
  //     setTimeout(() => {
  //       document.body.removeChild(link);
  //       URL.revokeObjectURL(url);
  //     }, 100);
  //   } catch (error) {
  //     console.error("Failed to generate PDF:", error);
  //     alert("Error generating PDF report");
  //   }
  // };

  const downloadPDFReport = async (analysisData: AnalysisData) => {
    try {
      // Check if data exists
      if (!analysisData) {
        throw new Error("No analysis data available");
      }

      // Transform the data structure to match what the PDF component expects
      const atsScoreData = analysisData.analysis?.atsScore;
      const normalizedAtsScore =
        typeof atsScoreData === "number"
          ? { score: atsScoreData, feedback: [] }
          : atsScoreData || { score: 0, feedback: [] };

      const jobFitScoreData = analysisData.analysis?.jobFitScore;
      let normalizedJobFitScore;

      if (typeof jobFitScoreData === "number") {
        normalizedJobFitScore = {
          score: jobFitScoreData,
          buckets: {},
          debug: { evidencePreview: { matched: [], missing: [] } },
        };
      } else if (jobFitScoreData && typeof jobFitScoreData === "object") {
        // Convert the API JobFitScore structure to PDF component structure
        const apiDebug = (jobFitScoreData as any).debug;
        normalizedJobFitScore = {
          score: jobFitScoreData.score || 0,
          buckets: jobFitScoreData.buckets || {},
          debug: {
            evidencePreview: apiDebug?.evidencePreview || {
              matched: [],
              missing: [],
            },
          },
        };
      } else {
        normalizedJobFitScore = {
          score: 0,
          buckets: {},
          debug: { evidencePreview: { matched: [], missing: [] } },
        };
      }

      const transformedData = {
        overallScore: analysisData.analysis?.overallScore || 0,
        atsScore: normalizedAtsScore,
        jobFitScore: normalizedJobFitScore,
        analysisLists: analysisData.analysis?.analysisLists || {
          strengths: [],
          improvements: [],
          gaps: [],
          recommendations: [],
          overallSummary: "",
        },
        meta: analysisData.analysis?.meta || {
          jobTitle: "",
          companyName: "",
          state: "",
          country: "",
        },
      };

      console.log("Transformed data for PDF:", transformedData);
      console.log("ATS Breakdown for PDF:", transformedData.atsScore.breakdown);

      const blob = await pdf(
        <ResumeAnalysisPDF analysisData={transformedData} />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;

      // Use job title in filename if available
      const jobTitle = transformedData.meta?.jobTitle
        ? transformedData.meta.jobTitle.replace(/\s+/g, "_")
        : "Resume";
      const timestamp = new Date().getTime();
      link.download = `${jobTitle}_Analysis_Report_${timestamp}.pdf`;

      document.body.appendChild(link);
      link.click();

      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (error) {
      console.error("Failed to generate PDF:", error);
      alert(
        "Error generating PDF report: " +
          (error instanceof Error ? error.message : "Unknown error")
      );
    }
  };
  const downloadSimplePrint = async (data: AnalysisData) => {
    // Create a simple text version for fallback
    const textContent = `
RESUME ANALYSIS REPORT
=====================

Generated: ${new Date().toLocaleDateString()}
Position: ${data.analysis.meta?.jobTitle || "N/A"}
Company: ${data.analysis.meta?.companyName || "N/A"}

OVERALL SCORE: ${data.analysis.overallScore}/100

STRENGTHS:
${
  data.analysis.analysisLists?.strengths.map((s) => `• ${s}`).join("\n") ||
  "None identified"
}

GAPS:
${
  data.analysis.analysisLists?.gaps.map((g) => `• ${g}`).join("\n") ||
  "None identified"
}

RECOMMENDATIONS:
${
  data.analysis.analysisLists?.recommendations
    .map((r) => `• ${r}`)
    .join("\n") || "None"
}

SUMMARY:
${data.analysis.analysisLists?.overallSummary || "No summary available"}
  `.trim();

    // Create and download text file
    const blob = new Blob([textContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Resume_Analysis_Report_${new Date().getTime()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownload = async () => {
    if (!analysisData) return;
    try {
      setIsDownloading(true);
      await downloadPDFReport(analysisData);
      console.log("PDF report generated successfully");
    } catch (e) {
      console.error("PDF generation failed, trying fallback:", e);
      try {
        await downloadSimplePrint(analysisData);
        console.log("Fallback text report generated");
      } catch (fallbackError) {
        console.error("Fallback also failed:", fallbackError);
        alert("Failed to generate report. Please try again.");
      }
    } finally {
      setIsDownloading(false);
    }
  };

  useEffect(() => {
    dlogOnce("mount", "🔎 results/page.tsx:", __RESULTS_BUILD_ID__, pathname);
  }, [pathname]);

  useEffect(() => {
    const raw = localStorage.getItem("resumeAnalysis");
    if (!raw) {
      console.warn("⚠️ No analysis data found in localStorage");
      setLoading(false);
      return;
    }

    try {
      const data = JSON.parse(raw) as AnalysisData;

      if (typeof data.analysis?.text === "string") {
        data.analysis.text = data.analysis.text.replace(/\r\n/g, "\n");
      }

      const pack = data.analysis?.pack;
      const lists = data.analysis?.analysisLists;

      if (pack) {
        const parsedFromPack = toParsedFromPack(pack, lists);
        setParsedAnalysis(parsedFromPack);
      } else {
        const sections = parseAllSections(data.analysis?.text || "");
        setParsedAnalysis(sections);
      }

      setAnalysisData(data);

      if (DEBUG) {
        const ats =
          typeof data.analysis?.atsScore === "number"
            ? data.analysis.atsScore
            : (data.analysis?.atsScore as any)?.["score"];
        const jfAny = data.analysis?.jobFitScore as
          | JobFitScore
          | number
          | undefined;
        const serverRaw =
          typeof jfAny === "number" ? jfAny : jfAny?.raw ?? jfAny?.score ?? 0;

        dlogOnce("loaded", "✅ Loaded analysis:", {
          ats,
          jobFitRaw: serverRaw,
        });
      }
    } catch (e) {
      console.error("❌ Failed to parse localStorage resumeAnalysis:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  // numeric ATS score
  const atsScore = useMemo(
    () =>
      typeof analysisData?.analysis?.atsScore === "number"
        ? analysisData.analysis.atsScore
        : (analysisData?.analysis?.atsScore as any)?.["score"] ?? 0,
    [analysisData]
  );

  /* ==== Job Fit score calculation ==== */
  const jf = analysisData?.analysis?.jobFitScore as
    | JobFitScore
    | number
    | undefined;

  const jobFitBuckets = useMemo(
    () => (typeof jf === "object" ? jf?.buckets : undefined),
    [jf]
  );

  const rawMatchScore = useMemo(() => {
    // Use the job fit score directly from the API instead of recalculating
    return typeof jf === "object" ? jf?.score ?? 0 : 0;
  }, [jf]);

  /* ==== Resume data extraction ==== */
  const resumeSkills = useMemo(
    () => analysisData?.analysis?.pack?.keySkills ?? [],
    [analysisData?.analysis?.pack?.keySkills]
  );

  const resumeBullets = useMemo(() => {
    // Try structured pack first
    let bullets =
      analysisData?.analysis?.pack?.professionalExperience?.flatMap(
        (r) => r.bullets || []
      ) ?? [];

    // Also include project bullets if available
    const projectBullets =
      analysisData?.analysis?.pack?.keyProjects?.flatMap(
        (p) => p.bullets || []
      ) ?? [];

    bullets = [...bullets, ...projectBullets];

    // Fallback: extract from parsed analysis text if structured data is empty
    if (bullets.length === 0 && parsedAnalysis?.professionalExperience) {
      const expText = parsedAnalysis.professionalExperience;
      // Extract bullet points from the text (lines starting with - or •)
      bullets = expText
        .split("\n")
        .map((line) => line.replace(/^[\s-•*]+\s*/, "").trim())
        .filter(
          (line) =>
            line.length > 0 && !line.startsWith("**") && !line.includes("—")
        );
    }

    console.log("🔍 Resume bullets extraction debug:", {
      analysisData: analysisData?.analysis?.pack,
      professionalExperience:
        analysisData?.analysis?.pack?.professionalExperience,
      keyProjects: analysisData?.analysis?.pack?.keyProjects,
      parsedExperience: parsedAnalysis?.professionalExperience,
      bullets: bullets,
      bulletsCount: bullets.length,
      sampleBullets: bullets.slice(0, 3), // Show first 3 bullets for debugging
    });

    return bullets;
  }, [
    analysisData?.analysis?.pack?.professionalExperience,
    analysisData?.analysis?.pack?.keyProjects,
    parsedAnalysis?.professionalExperience,
  ]);

  const quantifiedExamples = useMemo(() => {
    const examples = extractQuantifiedExamples(resumeBullets, 3);
    console.log("🔍 Quantified examples extraction debug:", {
      resumeBullets: resumeBullets,
      bulletsCount: resumeBullets.length,
      extractedExamples: examples,
      examplesCount: examples.length,
    });
    return examples;
  }, [resumeBullets]);

  /* ==== Education items ==== */
  const educationItems = useMemo(
    () => analysisData?.analysis?.pack?.educationAndCertification || [],
    [analysisData?.analysis?.pack?.educationAndCertification]
  );

  /* ==== JD keyword analysis ==== */
  type EvidenceItem = {
    item: string;
    resume_quotes?: string[];
    jd_quotes?: string[];
  };
  type EvidencePreview = { matched: EvidenceItem[]; missing: EvidenceItem[] };
  type JobFitScoreWithEvidence = {
    score: number;
    buckets: JobFitBuckets;
    gates: JobFitGates;
    debug: { evidencePreview?: EvidencePreview };
  };

  const coreMatchedRaw = useMemo(() => {
    const jfData = jf as JobFitScoreWithEvidence | undefined;
    return (
      jfData?.debug?.evidencePreview?.matched?.map((item) => item.item) || []
    );
  }, [jf]);

  const coreMissingRaw = useMemo(() => {
    const jfData = jf as JobFitScoreWithEvidence | undefined;
    return (
      jfData?.debug?.evidencePreview?.missing?.map((item) => item.item) || []
    );
  }, [jf]);

  const coreMatched = useMemo(
    () => normalizeJDItems(coreMatchedRaw),
    [coreMatchedRaw]
  );
  const coreMissing = useMemo(
    () => normalizeJDItems(coreMissingRaw),
    [coreMissingRaw]
  );

  // Debug logging for keyword data
  console.log("🔍 Core Matched Raw:", coreMatchedRaw);
  console.log("🔍 Core Matched Processed:", coreMatched);
  console.log("🔍 Core Missing Raw:", coreMissingRaw);
  console.log("🔍 Core Missing Processed:", coreMissing);

  const jdEducationGaps = useMemo(
    () => coreMissing.filter(isEducationLine),
    [coreMissing]
  );

  const jdMissingDesirable = useMemo(() => {
    const desirableSet = new Set(
      coreMissingRaw
        .filter((s) =>
          /desirable|advantageous|highly regarded|nice to have/i.test(String(s))
        )
        .map((s) => normalizeJDItems([s])[0])
    );
    console.log("🔍 Desirable Set:", desirableSet);
    const result = coreMissing.filter((x) => desirableSet.has(x));
    console.log("🔍 JD Missing Desirable:", result);
    return result;
  }, [coreMissing, coreMissingRaw]);

  const jdMissingRequired = useMemo(() => {
    const result = coreMissing.filter(
      (x) => !jdMissingDesirable.includes(x) && !jdEducationGaps.includes(x)
    );
    console.log("🔍 JD Missing Required:", result);
    return result;
  }, [coreMissing, jdMissingDesirable, jdEducationGaps]);

  /* ==== Analysis insights ==== */
  const strengthsArr = useMemo(
    () => mdListToArray(parsedAnalysis?.strengths || ""),
    [parsedAnalysis?.strengths]
  );
  const improvementsArr = useMemo(
    () => mdListToArray(parsedAnalysis?.opportunities || ""),
    [parsedAnalysis?.opportunities]
  );
  const gapsArr = useMemo(
    () => mdListToArray(parsedAnalysis?.gaps || ""),
    [parsedAnalysis?.gaps]
  );
  const recommendationsArr = useMemo(
    () => mdListToArray(parsedAnalysis?.recommendations || ""),
    [parsedAnalysis?.recommendations]
  );

  /* ==== ATS details ==== */
  const atsForComponent: ATSDetails | undefined = useMemo(() => {
    if (!analysisData) return undefined;
    const atsRaw = analysisData.analysis?.atsScore as
      | number
      | {
          score: number;
          feedback?: string[];
          breakdown?: Array<{ label: string; score: number; max: number }>;
        }
      | undefined;
    return toATSDetails(
      atsRaw,
      coreMissing,
      parsedAnalysis,
      analysisData.analysis?.pack
    );
  }, [analysisData, coreMissing, parsedAnalysis]);

  if (loading) {
    return (
      <main className="!pt-0 w-full max-w-none">
        <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-br from-blue-50 to-purple-50">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center"
          >
            <div className="text-2xl font-semibold text-gray-700 mb-4">
              Analyzing your resume...
            </div>
            <LoadingDots />
          </motion.div>
        </div>
      </main>
    );
  }

  if (!analysisData) {
    return (
      <main className="!pt-0 w-full max-w-none">
        <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-br from-blue-50 to-purple-50">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center"
          >
            <div className="text-2xl font-semibold text-gray-700 mb-4">
              No analysis data found
            </div>
            <Link
              href="/resume"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              Go back to analyze your resume
            </Link>
          </motion.div>
        </div>
      </main>
    );
  }

  return (
    <main className="!pt-0 w-full max-w-none">
      <nav className="p-2 pl-6">
        <Link
          href="/resume"
          className="flex items-center gap-2 px-4 py-2 mt-2 bg-black text-white rounded-lg shadow-sm hover:bg-gray-800 hover:shadow-md transition-all duration-200 w-fit"
        >
          <ArrowLeft className="w-4 h-4 text-white" />
          <span className="text-white text-sm font-semibold">Back</span>
        </Link>
      </nav>

      <div id="results-content">
        <section className="w-full p-6 pl-8 overflow-y-auto">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8"
          >
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 md:gap-6">
              <div className="flex flex-col gap-2 flex-1">
                <h1 className="text-3xl md:text-4xl text-black font-bold">
                  Resume Analysis Complete!
                </h1>
                <p className="text-base md:text-lg text-gray-600">
                  Here's your detailed performance breakdown...
                </p>
              </div>
              <div className="flex flex-col items-start md:items-end gap-2 w-full md:w-auto">
                <Button
                  onClick={handleDownload}
                  className="w-full md:w-auto"
                  disabled={isDownloading}
                >
                  {isDownloading ? "Generating…" : "Download PDF"}
                </Button>

                <p className="text-xs font-semibold text-gray-500 text-center md:text-right w-full">
                  Download Detail Report
                </p>
              </div>
            </div>
          </motion.div>

          {/* Match Score */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mb-8 rounded-2xl shadow-md bg-white p-6"
          >
            <div className="flex items-center gap-6">
              <div className="shrink-0">
                <ScoreChart score={rawMatchScore} />
              </div>
              <div>
                <h3 className="text-2xl font-semibold mb-1">Match Score</h3>
                <p className="text-sm text-gray-600">
                  Calculated based on your resume and the job description.
                </p>
              </div>
            </div>
          </motion.div>

          {/* Insight Cards */}
          {parsedAnalysis && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mb-10"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/60">
                  <h3 className="font-semibold text-emerald-900 mb-2">
                    Strengths
                  </h3>
                  <ul className="list-disc pl-5 space-y-1 text-emerald-900">
                    {strengthsArr.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>

                <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/60">
                  <h3 className="font-semibold text-rose-900 mb-2">
                    Weaknesses
                  </h3>
                  <ul className="list-disc pl-5 space-y-1 text-rose-900">
                    {gapsArr.length
                      ? gapsArr.map((s, i) => <li key={i}>{s}</li>)
                      : improvementsArr.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>

                <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/60">
                  <h3 className="font-semibold text-amber-900 mb-2">
                    Improvements
                  </h3>
                  <ul className="list-disc pl-5 space-y-1 text-amber-900">
                    {improvementsArr.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>

                <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/60">
                  <h3 className="font-semibold text-indigo-900 mb-2">
                    Recommendations
                  </h3>
                  <ul className="list-disc pl-5 space-y-1 text-indigo-900">
                    {recommendationsArr.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </motion.section>
          )}

          {/* ATS Breakdown */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mb-8"
          >
            <ATSBreakdown
              details={atsForComponent}
              resumeSkills={resumeSkills}
              quantifiedExamples={quantifiedExamples}
              jdMatchedCore={coreMatched}
              jdMissingRequired={jdMissingRequired}
              jdMissingDesirable={jdMissingDesirable}
              educationGaps={jdEducationGaps}
              educationItems={educationItems}
            />
          </motion.div>
        </section>
      </div>
    </main>
  );
};

export default ResultsPage;
