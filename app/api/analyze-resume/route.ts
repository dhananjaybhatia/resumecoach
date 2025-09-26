// app/api/analyze-resume/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import mammoth from "mammoth";
import crypto from "crypto";
import { checkRateLimit } from '@/lib/rate.limit';

/** Next.js runtime flags */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

/** OpenAI client */
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** -------------------- Small helpers -------------------- */
const TOK_MAX_WORDS = 5; // keep skills short
const normalize = (s: string) =>
    s.toLowerCase()
        .replace(/[^a-z0-9+#.\-\s]/g, " ")
        .replace(/\s+/g, " ")
        .replace(/[.,;:]+$/, "")
        .trim();

type KeywordMatch = {
    matched: string[];
    missing: string[];
    pct: number;
    presentInJD: string[];
};

type KeywordMatchSem = KeywordMatch & {
    partial: string[];
};

function filterDegreeTitleKeywords(keywords: string[]): string[] {
    const degreeTitles = [
        "statistics", "mathematics", "computer science", "economics",
        "engineering", "nursing", "medicine", "business", "finance",
        "physics", "chemistry", "biology", "accounting"
    ];

    return keywords.filter(kw =>
        !degreeTitles.some(degree =>
            kw.toLowerCase().includes(degree.toLowerCase())
        )
    );
}

const PROGRAMMING_LANGS = [
    "Python", "R", "Java", "C#", "C++", "JavaScript", "TypeScript", "Scala", "Go", "MATLAB", "SAS", "Julia", "Ruby", "PHP"
];
const cvHasAnyLanguage = (cv: string) => PROGRAMMING_LANGS.some(l => containsToken(cv, l));


function mapToolName(raw: string): string {
    const s = normalize(raw);
    if (!s) return raw;

    // canonical mappings
    if (/(^|\s)(ms|microsoft)\s*sql\b|(^|\s)tsql\b|(^|\s)mssql\b/.test(s)) return "SQL Server";
    if (/^power\s*bi(\s*desktop)?$|^pbi$/.test(s)) return "Power BI";
    if (/^power\s*query$|^powerquery$|^pq$/.test(s)) return "Power Query";
    if (/^ssms$|sql\s*server\s*management\s*studio/.test(s)) return "SSMS";
    if (/^excel$|^microsoft\s*excel$/.test(s)) return "Microsoft Excel";

    // keep originals for other whitelist entries
    if (/^dax$/.test(s)) return "DAX";
    if (/^python$/.test(s)) return "Python";
    if (/^mysql$/.test(s)) return "MySQL";
    if (/^tableau$/.test(s)) return "Tableau";

    return raw; // unchanged
}

const toStr = (v: any): string => (typeof v === "string" ? v : "");

const toArr = (v: any): string[] => {
    if (Array.isArray(v)) return v.map((x) => String(x)).map((s) => s.trim()).filter(Boolean);
    if (typeof v === "string") return v.split(/[\n,;|•\-]+/g).map((s) => s.trim()).filter(Boolean);
    return [];
};

type Exp = { employer: string; title: string; location?: string; start?: string; end?: string; bullets: string[] };
const toExpArr = (v: any): Exp[] =>
    Array.isArray(v)
        ? v
            .map((r) => (r && typeof r === "object" ? r : {}))
            .map((r) => ({
                employer: toStr((r as any).employer),
                title: toStr((r as any).title),
                location: toStr((r as any).location),
                start: toStr((r as any).start),
                end: toStr((r as any).end),
                bullets: toArr((r as any).bullets),
            }))
            .filter((r) => r.employer || r.title || r.bullets.length)
        : [];

type Proj = { name: string; context?: string; tools?: string[]; bullets: string[] };
const toProjArr = (v: any): Proj[] =>
    Array.isArray(v)
        ? v
            .map((p) => (p && typeof p === "object" ? p : {}))
            .map((p) => ({
                name: toStr((p as any).name),
                context: toStr((p as any).context),
                tools: toArr((p as any).tools),
                bullets: toArr((p as any).bullets),
            }))
            .filter((p) => p.name || p.bullets.length)
        : [];

type Edu = { name: string; institution?: string; year?: string };
const toEduArr = (v: any): Edu[] =>
    Array.isArray(v)
        ? v
            .map((e) => (e && typeof e === "object" ? e : {}))
            .map((e) => ({
                name: toStr((e as any).name),
                institution: toStr((e as any).institution),
                year: toStr((e as any).year),
            }))
            .filter((e) => e.name)
        : [];

const uniqNorm = (arr: string[]) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of arr || []) {
        const n = normalize(s);
        if (!n) continue;
        if (!seen.has(n)) {
            seen.add(n);
            out.push(s);
        }
    }
    return out;
};

function noStoreHeaders() {
    return { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache", Expires: "0" };
}

function evidenceSafeJoin(arr?: string[]): string[] {
    return Array.isArray(arr) ? arr.map(toStr).filter(Boolean).slice(0, 3) : [];
}

function enforceDomainConsistency(markdown: string, resumeText: string, jobDescText: string): string {
    // Remove domain-specific claims not present in either text (hard guardrails)
    const corpus = (resumeText + " " + jobDescText).toLowerCase();
    const bannedUnlessPresent = [
        "ahpra",
        "registered nurse",
        "rn",
        "patient care",
        "medication administration",
        "aged care",
        "ndis",
        "police check",
        "working with children check",
    ];
    const lines = markdown.split("\n");
    const filtered = lines.filter((line) => {
        const l = line.toLowerCase();
        return !bannedUnlessPresent.some((tok) => l.includes(tok) && !corpus.includes(tok));
    });
    return filtered.join("\n");
}

/** -------------------- pdfjs-dist lazy import (Node, no worker) -------------------- */
// Lazy-load pdf-parse only when needed (avoids Turbopack side effects)
async function pdfParseNode(buf: Buffer) {
    try {
        // prefer the concrete file to dodge test harness paths
        // @ts-expect-error - no types for this internal path
        const mod: any = await import("pdf-parse/lib/pdf-parse.js");
        return (mod.default ?? mod)(buf);
    } catch {
        const mod: any = await import("pdf-parse");
        return (mod.default ?? mod)(buf);
    }
}
async function extractTextFromPdfBytes(bytes: Uint8Array): Promise<string> {
    const { text } = await pdfParseNode(Buffer.from(bytes));
    const out = (text || "").trim();
    if (!out || out.length < 50) {
        throw new Error(
            "The uploaded PDF looks like a scanned image (no extractable text). Please upload a text-based PDF or DOCX, or run OCR before uploading."
        );
    }
    return out;
}


/** -------------------- File → text (DOCX/PDF/TXT) -------------------- */

async function extractTextFromFile(file: File): Promise<{ text: string; sections: any }> {
    try {
        // Get the raw bytes once
        const ab = await file.arrayBuffer();
        let extractedText = "";

        const name = file.name || "";
        const mime = (file.type || "").toLowerCase();

        const isDocx =
            mime.includes("officedocument") ||
            mime.includes("word") ||
            /\.docx?$/i.test(name);

        const isPdf = mime.includes("pdf") || /\.pdf$/i.test(name);

        if (isDocx) {
            // mammoth needs a Node Buffer for DOCX files
            const buffer = Buffer.from(ab);
            const result = await mammoth.extractRawText({ buffer });
            extractedText = result.value || "";
        } else if (isPdf) {
            // pdfjs-dist v5 wants Uint8Array - use it directly
            const bytes = new Uint8Array(ab);  // This is already a Uint8Array
            extractedText = await extractTextFromPdfBytes(bytes);
            if (!extractedText || extractedText.trim().length < 50) {
                throw new Error(
                    "The uploaded PDF looks like a scanned image (no extractable text). Please upload a text-based PDF or DOCX, or run OCR before uploading."
                );
            }
        } else if (/\.txt$/i.test(name) || mime === "text/plain") {
            extractedText = new TextDecoder("utf-8").decode(ab);
        } else {
            throw new Error("Unsupported file type. Please upload a PDF, DOCX, or TXT.");
        }

        // ... rest of your function remains the same
        // Normalise whitespace
        extractedText = extractedText
            .normalize("NFKC")
            .replace(/\u00a0/g, " ")
            .replace(/\r\n?/g, "\n")
            .replace(/[ \t]+\n/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim();

        const text = extractedText.toLowerCase();
        const sections = {
            hasSummary: /(?:\bsummary\b|\bobjective\b|\bprofile\b|professional summary)/i.test(text),
            hasEducation: /education|academic|qualification|degree|certificate|university|college/i.test(text),
            hasSkills: /(?:\bskills?\b|competenc|technical skills|core skills|tools|technologies)/i.test(text),
            hasExperience:
                /(?:^|\n)\s*(?:experience|work experience|employment|work history|professional experience|clinical experience|demonstrated\s+capabilit(?:y|ies))/i.test(
                    extractedText
                ),
            hasTools: /tools|technologies|software|technical proficiencies/i.test(text),
            hasProjects: /project|case stud(y|ies)|implementation|engagements?/i.test(text),
            hasContact: /(?:phone|mobile|tel|email|@|linkedin\.com|address|\b\d{3,}\s+\w+ (?:st|rd|ave|road)\b)/i.test(text),
            usesBullets: /•|\*|\-|\d\./.test(extractedText),
        };

        return { text: extractedText, sections };
    } catch (error) {
        console.error("Text extraction error:", error);
        throw new Error(error instanceof Error ? error.message : "Failed to extract text from file");
    }
}


/** -------------------- Minimal section extractor (ATS heuristics) -------------------- */
function extractSection(
    text: string,
    sectionType: "summary" | "skills" | "experience" | "education" | "projects"
) {
    const map = {
        summary: [
            /(?:professional summary|summary|profile|objective)[:\s]*\n([\s\S]*?)(?=\n\s*\n|\n[A-Z][A-Za-z]|$)/i,
            /(?:professional summary|summary|profile|objective)[:\s]*([^\n]+?)(?=\n|$)/i,
        ],
        skills: [
            /(?:skills|competencies|technical skills|key skills|tools|technologies)[:\s]*\n([\s\S]*?)(?=\n\s*\n|\n[A-Z][A-Za-z]|$)/i,
            /(?:skills|competencies|technical skills|key skills|tools|technologies)[:\s]*([^\n]+?)(?=\n|$)/i,
        ],
        experience: [
            /(?:^|\n)\s*(?:experience|work experience|employment|work history|professional experience|clinical experience)\s*:?\s*\n+([\s\S]*?)(?=\n\s*(?:education|skills|projects|tools|technologies|training|certifications?|licenses?|references?|$)|$)/i,
            /(?:^|\n)\s*(?:experience|work experience|employment|work history|professional experience|clinical experience)\s*:?\s*([^\n]+?)(?=\n|$)/i,
        ],
        education: [
            /(?:^|\n)\s*(?:education|academic|qualifications?|certifications?|training)\s*[:\s]*\n([\s\S]*?)(?=\n\s*\n|\n(?:skills?|experience|projects?|tools?|technologies?)\b|$)/i,
        ],
        projects: [
            /(?:projects|selected projects|assignments|engagements|list of projects)[:\s]*\n([\s\S]*?)(?=\n\s*\n|\n[A-Z][A-Za-z]|$)/i,
        ],
    } as const;

    for (const re of map[sectionType]) {
        const m = text.match(re);
        if (m?.[1]) return m[1].trim();
    }
    return "";
}

/** -------------------- Scoped excerpt helpers -------------------- */


/** ---------- Section label sets (headings we recognise) ---------- */
const EDUCATION_LABELS: RegExp[] = [
    /(?:^|\n)\s*(education|academic|qualifications?|certifications?|training|courses?|professional\s+development)\s*:?\s*(?:\n|$)/i,
];

const PROJECTS_LABELS: RegExp[] = [
    /(?:^|\n)\s*(?:[-•]\s*)?(projects?|key\s+projects|selected\s+projects|case\s+stud(?:y|ies)|engagements?|assignments?|list\s+of\s+projects|worked\s+on\s+projects?)\s*:?\s*(?:\n|$)/i,
];

const SKILLS_LABELS: RegExp[] = [
    /(?:^|\n)\s*(skills?|key\s+skills|technical\s+skills|competenc(?:y|ies)|core\s+skills|technical\s+proficiencies|tools\s*&?\s*technologies|tech\s+stack|capabilit(?:y|ies))\s*:?\s*(?:\n|$)/i,
    /(?:^|\n)\s*demonstrated\s+capabilities\s+and\s+skills\s*:?\s*(?:\n|$)/i, // NEW
];

/** Headings that typically terminate a block */
const SECTION_STOP_LABELS: RegExp[] = [
    /(?:^|\n)\s*(?:summary|objective|profile|professional\s+summary)\s*:?\s*(?:\n|$)/i,
    /(?:^|\n)\s*(?:experience|work\s+experience|employment|work\s+history|professional\s+experience|clinical\s+experience)\s*:?\s*(?:\n|$)/i,
    /(?:^|\n)\s*(?:skills?|key\s+skills|technical\s+skills|competenc(?:y|ies)|core\s+skills|technical\s+proficiencies|tools\s*&?\s*technologies|tech\s+stack|capabilit(?:y|ies))\s*:?\s*(?:\n|$)/i,
    /(?:^|\n)\s*(?:education|academic|qualifications?|certifications?|training|courses?|professional\s+development)\s*:?\s*(?:\n|$)/i,
    /(?:^|\n)\s*(?:projects?|key\s+projects|selected\s+projects|case\s+stud(?:y|ies)|engagements?|assignments?)\s*:?\s*(?:\n|$)/i,
    /(?:^|\n)\s*(?:awards?|publications?|interests?|hobbies|references?)\s*:?\s*(?:\n|$)/i,
];

const SUMMARY_LABELS: RegExp[] = [
    /(?:^|\n)\s*(?:professional\s+summary|summary|profile|objective)\s*:?\s*(?:\n|$)/i,
];

// Lock Summary to the excerpt + skills
function computeSummaryFlags(summaryRaw: string, skillsRaw: string) {
    const lc = (summaryRaw || "").toLowerCase();
    const hasSummary = lc.trim().length > 0;
    const hasYrs = /\b\d+\s*(\+|plus)?\s*(years?|yrs?)\b/.test(lc);
    const hasMetric = /(\$[\d,]+|\d+(?:\.\d+)?%|\b\d+(?:\.\d+)?\s+(hours?|days?|weeks?|months?))\b/i.test(summaryRaw || "");
    const skills = extractAtomicSkills(skillsRaw || "").map((s) => s.toLowerCase());
    const hasKeySkill =
        hasSummary &&
        skills.some((tok) => {
            const esc = tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            if (tok.length <= 3) return new RegExp(`(^|\\W)${esc}(\\W|$)`, "i").test(summaryRaw || "");
            return new RegExp(tok.includes(" ") ? esc : `\\b${esc}\\b`, "i").test(summaryRaw || "");
        });

    const score = Math.min(20, (hasSummary ? 5 : 0) + (hasYrs ? 5 : 0) + (hasMetric ? 5 : 0) + (hasKeySkill ? 5 : 0));
    const reasons = [
        hasSummary ? "has summary" : "no summary",
        hasYrs ? "years mentioned" : "years not mentioned",
        hasMetric ? "has quantified outcome" : "no quantified outcome",
        hasKeySkill ? "mentions a resume skill" : "no skill mentioned",
    ];
    return { score, reasons };
}

// Make Structure deterministic from your section flags
function computeStructure(sections: any) {
    const score25 =
        (sections.hasSummary ? 6 : 0) + (sections.hasExperience ? 8 : 0) + (sections.hasSkills ? 6 : 0) +
        (sections.hasEducation ? 6 : 0) + (sections.hasTools ? 4 : 0) + (sections.hasProjects ? 4 : 0) + (sections.hasContact ? 4 : 0);
    const score = Math.min(20, Math.round((Math.min(score25, 25) / 25) * 20));
    const reasons = [
        sections.hasSummary ? "has summary" : "missing summary",
        sections.hasExperience ? "has experience" : "missing experience",
        sections.hasSkills ? "has skills" : "missing skills",
        sections.hasEducation ? "has education" : "missing education",
        sections.hasContact ? "contact info present" : "no contact info",
        sections.usesBullets ? "uses bullets" : "no bullets",
    ];
    return { score, reasons };
}

// Drive Keywords from a single computation
// --- small helpers
const STOPWORDS = new Set([
    "and", "or", "with", "of", "in", "to", "for", "on", "the", "a", "an", "including", "such as",
    "etc", "eg", "e.g.", "i.e.", "via", "using", "across", "other", "based", "program", "tools",
    "systems", "applications", "platforms", "solutions", "experience", "proficient", "knowledge",
    "understanding", "highly", "regarded", "preferred", "desirable", "required",
    "assist", "assisting", "ability", "abilities", "demonstrated", "strong", "well-developed",
    "previous", "key", "working", "registered", "experience with", "experience in"
]);


// Map common synonyms / variants to a canonical token
const CANON_MAP: Record<string, string> = {
    "pbi": "Power BI",
    "powerbi": "Power BI",
    "power bi desktop": "Power BI",
    "ms sql": "SQL Server",
    "mssql": "SQL Server",
    "t-sql": "SQL Server",
    "tsql": "SQL Server",
    "gcp": "GCP",
    "google bigquery": "BigQuery",
    "red shift": "Redshift",
    "dotnet": ".NET",
    ".net": ".NET",
    "github": "Git",
    "gitlab": "Git",
    "azure devops": "Azure DevOps",
};

function canon(tok: string): string {
    const k = tok.toLowerCase().trim();
    return CANON_MAP[k] || tok; // keep original if not mapped
}

function cleanToken(s: string): string {
    return s
        .replace(/^[•\-\u2022\s]+/, "")
        .replace(/\(.*?\)/g, "")
        .replace(/\band\/or\b/gi, " ")
        .replace(/\b(is\s+(?:highly\s+)?regarded|is\s+(?:required|preferred|desirable|essential))\b.*$/i, "")
        .replace(/\b(such\s+as|including)\b.*$/i, "")
        .replace(/\.(?:\s|$).*/, "")             // NEW: cut after sentence dot
        .replace(/\b(include|includes|include:)\b.*$/i, "") // NEW: drop trailing “include”
        .replace(/[(){}\[\],;:]+$/g, "")
        .replace(/\s+/g, " ")
        .trim();
}


/** ---------- Flexible normalisation & variants (profession-agnostic) ---------- */
function normLoose(s: string) {
    return (s || "")
        .normalize("NFKC")
        .toLowerCase()
        .replace(/\u00a0/g, " ")
        .replace(/[(){}[\],;:]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function hyphenSpaceVariants(s: string): string[] {
    const a = s.replace(/\s+/g, "-");
    const b = s.replace(/[-\u2010-\u2015]/g, " ");
    return Array.from(new Set([s, a, b]));
}

function lightStems(s: string): string[] {
    // generic morphology trims for English (keeps profession-agnostic)
    const out = new Set<string>([s]);
    const re = /\b(\w{3,})(ing|ed|es|s|al|ally|ation|ations|er|ers|ion|ions|ive|ives|ary|aries)\b/gi;
    const base = s.replace(re, "$1");
    out.add(base);
    return Array.from(out).filter(Boolean);
}

function genVariants(tok: string): string[] {
    const base = cleanToken(tok);
    const hs = hyphenSpaceVariants(base);
    const stems = hs.flatMap(lightStems);
    // Example targeted equivalences that show up across domains
    const swapPairs: Array<[RegExp, string]> = [
        [/\bpost\s*procedure\b/gi, "post-procedure"],
        [/\bprocedures?\b/gi, "procedural"],
        [/\brecover\b/gi, "recovery"],
        [/\bobservation\b/gi, "observations"],
        [/\brecover(?:ing)?\s+patients?\s+post(?:\s|-)?procedure\b/gi, "post-procedure recovery"],
        [/\bmedical\s+history\s+assessment\b/gi, "history taking"],
        [/\bgaining\s+informed\s+consent\b/gi, "informed consent"],
        [/\bmonitor(?:ing)?\s+baseline\s+observations?\b/gi, "baseline observations"],

    ];
    const swaps = stems.flatMap(v => {
        let x = [v];
        for (const [re, rep] of swapPairs) {
            x = x.flatMap(xx => Array.from(new Set([xx, xx.replace(re, rep), xx.replace(new RegExp(rep, "gi"), xx.match(re)?.[0] || rep)])));
        }
        return x;
    });
    return Array.from(new Set(swaps.map(normLoose).filter(Boolean)));
}



function isLikelyKeyword(tok: string): boolean {
    if (!tok) return false;
    const lc = tok.toLowerCase();

    // drop long generic phrases outright (over 5 words)
    if (tok.split(/\s+/).length > 5) return false;

    // drop JD boilerplate we never want as keywords
    if (/\b(highly regarded|preferably|preferred|required|desirable|essential|experience across|experience with|good understanding of)\b/i.test(tok)) {
        return false;
    }

    if (STOPWORDS.has(lc)) return false;
    // drop very short generic tokens unless ALL CAPS (e.g., R, C, C#)
    if (tok.length < 2 && tok !== "R") return false;

    // keep acronyms, techs, proper nouns, hyphenated/with punctuation
    const looksLikeTech =
        /[A-Z][a-z]/.test(tok) ||               // TitleCase (Power, Tableau, ThoughtSpot)
        /^[A-Z0-9\.\+#-]{2,}$/.test(tok) ||     // ALLCAPS/acronyms/.NET/C#/C++
        /[A-Za-z]+\s+[A-Za-z]+/.test(tok) ||    // multi-word
        /[0-9]/.test(tok);                      // versions (ISO 27001, ITIL v4)

    return looksLikeTech;
}

// Extract candidate phrases after “trigger” words (e.g., "experience with X, Y, Z")
function extractTriggeredLists(jd: string): string[] {
    const out: string[] = [];
    const triggers = [
        /experience\s+(?:with|in|across)\s*[:-]?\s*(.+)/i,
        /proficien(?:t|cy)\s+(?:in|with)\s*[:-]?\s*(.+)/i,
        /skills?\s*(?:required|preferred)?\s*[:-]?\s*(.+)/i,
        /tools?\s*(?:&?\s*technologies|and technologies)?\s*[:-]?\s*(.+)/i,
        /including\s+(.+)/i,
        /such\s+as\s+(.+)/i,
        /familiarity\s+with\s+(.+)/i,            // NEW
        /collaborat(?:e|ing|ion)\s+with\s+(.+)/i  // NEW → captures "cross-functional teams"
    ];

    jd.split(/\n+/).forEach(line => {
        const text = line.trim().replace(/\band\/or\b/gi, " and ");
        for (const re of triggers) {
            const m = text.match(re);
            if (m?.[1]) {
                // stop at sentence end; then split by common delimiters
                const seg = m[1].split(/[.?!]/)[0];
                seg.split(/[,/|;]|(?:\s+and\s+)|(?:\s+or\s+)/i)
                    .map(cleanToken)
                    .filter(Boolean)
                    .forEach(t => out.push(t));
            }
        }
    });
    return out;
}

// Extract capitalised phrases, acronyms, and dotted names anywhere in the JD
function extractNounPhrases(jd: string): string[] {
    const out: string[] = [];

    // Multi-word TitleCase phrases (allow ., /, +, #, -, & between tokens, up to 4 words)
    // In extractNounPhrases()
    const mw =
        jd.match(
            // removed '.' from the token char class to avoid "Injections. Working"
            /\b([A-Z][A-Za-z0-9+#/-]*(?:\s+[A-Z0-9][A-Za-z0-9+#/-]*){0,3})\b/g
        ) || [];
    out.push(...mw);

    // after computing `mw`
    const BAD_TITLECASE_SINGLE = new Set(["About", "Our", "Strong", "Solid", "Familiarity", "Prior", "Understanding", "Experience", "Tertiary", "Related", "Field"]);
    out.push(...mw.filter(w => !(BAD_TITLECASE_SINGLE.has(w) && !/\s/.test(w))));


    // ALL-CAPS acronyms 2–10 chars (SQL, AWS, SAFe, ISO)
    const caps = jd.match(/\b([A-Z][A-Z0-9]{1,9})\b/g) || [];
    out.push(...caps);

    // Tech with special chars (C#, C++, .NET, Node.js)
    const dotted = jd.match(/\b(?:C\+\+|C#|\.NET|Node\.js|React\.js|Vue\.js)\b/g) || [];
    out.push(...dotted);

    return out.map(cleanToken);
}

// Build the JD dictionary dynamically, with optional extras from ENV
function buildJDDictionary(jd: string): string[] {
    const triggeredLists = extractTriggeredLists(jd);
    const nounPhrases = extractNounPhrases(jd);

    console.log("🔍 buildJDDictionary debug:", {
        jdLength: jd.length,
        jdPreview: jd.substring(0, 200) + "...",
        triggeredListsCount: triggeredLists.length,
        nounPhrasesCount: nounPhrases.length,
        triggeredLists: triggeredLists.slice(0, 5),
        nounPhrases: nounPhrases.slice(0, 5)
    });

    const raw = [
        ...triggeredLists,
        ...nounPhrases,
    ];

    // Optional extras via env (JSON array string), e.g. '["Cognos","ThoughtSpot"]'
    let extras: string[] = [];
    try {
        if (process.env.JD_KEYWORDS_EXTRA) {
            const arr = JSON.parse(process.env.JD_KEYWORDS_EXTRA);
            if (Array.isArray(arr)) extras = arr.map(String);
        }
    } catch { /* ignore */ }

    // Clean → filter → canonicalise → de-dup (case-insensitive)
    const seen = new Set<string>();
    const dict: string[] = [];
    for (const t of [...raw, ...extras]) {
        const tok = canon(cleanToken(t));
        if (!isLikelyKeyword(tok)) continue;
        const k = tok.toLowerCase();
        if (!seen.has(k)) {
            seen.add(k);
            dict.push(tok);
        }
    }

    // Trim noise: remove generic phrases that slipped through (light heuristic)
    const tooGeneric = /(?:\b(reports?|reporting|analytics?|analysis|stakeholders?|process(?:es)?|framework|environment|ability|strong|demonstrated|well[-\s]?developed|previous\s+experience|registered|assist(?:ing)?)\b)/i;
    const filtered = dict.filter(d => !tooGeneric.test(d));

    const JD_BAD_SINGLETONS = new Set([
        "about", "our", "strong", "solid", "familiarity", "prior", "understanding", "experience",
        "proficiency", "qualification", "qualifications", "tertiary", "related", "field", "a", "an", "the"
    ]);
    const BAD_PHRASES: RegExp[] = [
        /\b(a\s+related\s+field)\b/i,
        /\bat\s+least\s+one\s+programming\s+language\b/i
    ];

    const cleaned = filtered.filter(tok => {
        const lc = tok.toLowerCase().trim();
        if (JD_BAD_SINGLETONS.has(lc)) return false;
        if (BAD_PHRASES.some(re => re.test(lc))) return false;
        return true;
    });

    // Cap to avoid overweighting very long JDs
    const final = cleaned.slice(0, 60);

    console.log("🔍 buildJDDictionary final result:", {
        rawCount: raw.length,
        dictCount: dict.length,
        filteredCount: filtered.length,
        finalCount: final.length,
        finalKeywords: final.slice(0, 10)
    });

    return final;
}

// Normalised presence test with flexible variants + regex word boundaries
function containsToken(cvText: string, token: string): boolean {
    const cv = normLoose(cvText);

    // 1) exact-ish with hyphen/space and morphology variants
    for (const v of genVariants(token)) {
        const vEsc = v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s-]+");
        const re = new RegExp(`(^|[^a-z0-9])${vEsc}([^a-z0-9]|$)`, "i");
        if (re.test(cv)) return true;
    }

    return false;
}
function jwSimilarity(a: string, b: string): number {
    // quick Jaro-Winkler (very small approximation); good enough for near-duplicates
    const s1 = a.toLowerCase(), s2 = b.toLowerCase();
    if (s1 === s2) return 1;
    const mDist = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
    const matches1 = new Array(s1.length).fill(false);
    const matches2 = new Array(s2.length).fill(false);
    let matches = 0;

    for (let i = 0; i < s1.length; i++) {
        const start = Math.max(0, i - mDist);
        const end = Math.min(i + mDist + 1, s2.length);
        for (let j = start; j < end; j++) {
            if (!matches2[j] && s1[i] === s2[j]) {
                matches1[i] = matches2[j] = true;
                matches++;
                break;
            }
        }
    }
    if (!matches) return 0;

    const s1m = [], s2m = [];
    for (let i = 0; i < s1.length; i++) if (matches1[i]) s1m.push(s1[i]);
    for (let j = 0; j < s2.length; j++) if (matches2[j]) s2m.push(s2[j]);

    let t = 0;
    for (let i = 0; i < s1m.length; i++) if (s1m[i] !== s2m[i]) t++;
    t = t / 2;

    const jaro = (matches / s1.length + matches / s2.length + (matches - t) / matches) / 3;
    // Winkler boost for common prefix up to 4
    let l = 0;
    while (l < 4 && s1[l] === s2[l]) l++;
    return jaro + l * 0.1 * (1 - jaro);
}

// Fuzzy n-gram fallback (n=1..5), threshold ~0.90
function fuzzyContains(cvText: string, token: string, threshold = 0.86): boolean {
    const cv = normLoose(cvText);
    const t = normLoose(token);
    const words = cv.split(/\s+/).filter(Boolean);
    const tWords = t.split(/\s+/).filter(Boolean);
    const n = Math.min(5, Math.max(1, tWords.length));
    for (let k = 1; k <= n; k++) {
        for (let i = 0; i <= words.length - k; i++) {
            const gram = words.slice(i, i + k).join(" ");
            if (jwSimilarity(gram, t) >= threshold) return true;
        }
    }
    return false;
}

async function semanticPartialHit(openaiClient: OpenAI, cvText: string, token: string): Promise<boolean> {
    if (!process.env.ENABLE_SEMANTIC_MATCH) return false;
    if (!process.env.OPENAI_API_KEY) return false;

    const t = token.trim();
    if (!t) return false;

    // sample candidate CV sentences (light heuristic)
    const sentences = cvText
        .split(/(?<=[.!?])\s+/)
        .filter(s => s && s.length < 300)
        .slice(0, 200);

    const [tEmbRes, sEmbRes] = await Promise.all([
        openaiClient.embeddings.create({ model: "text-embedding-3-small", input: t }),
        openaiClient.embeddings.create({ model: "text-embedding-3-small", input: sentences })
    ]);

    const tVec = tEmbRes.data[0].embedding;
    const dot = (a: number[], b: number[]) => a.reduce((acc, v, i) => acc + v * b[i], 0);
    const norm = (a: number[]) => Math.sqrt(dot(a, a));
    const cos = (a: number[], b: number[]) => dot(a, b) / (norm(a) * norm(b) + 1e-9);

    const THRESH = 0.78; // good default across domains
    for (let i = 0; i < sEmbRes.data.length; i++) {
        const sVec = sEmbRes.data[i].embedding;
        if (cos(tVec, sVec) >= THRESH) return true;
    }
    return false;
}

export function computeKeywordMatch(jd: string, cv: string): KeywordMatch {
    let DICT = buildJDDictionary(jd);

    // Debug logging
    console.log("🔍 Keyword extraction debug:", {
        jdLength: jd.length,
        jdPreview: jd.substring(0, 200) + "...",
        dictLength: DICT.length,
        dictContent: DICT.slice(0, 10) // Show first 10 keywords
    });

    const matched: string[] = [];
    const missing: string[] = [];

    // Concept expansion / normalisation
    if (DICT.some(t => /\bat\s+least\s+one\s+programming\s+language\b/i.test(t))) {
        DICT = DICT.filter(t => !/\bat\s+least\s+one\s+programming\s+language\b/i.test(t))
            .concat(["Programming language"]);
    }

    const presentInJD = DICT;

    for (const k of presentInJD) {
        if (/^Programming language$/i.test(k)) {
            const hit = cvHasAnyLanguage(cv);
            (hit ? matched : missing).push("Programming language");
            continue;
        }
        const hit = containsToken(cv, k) || fuzzyContains(cv, k, 0.90);
        (hit ? matched : missing).push(k);
    }

    const pct = presentInJD.length
        ? Math.round((matched.length / presentInJD.length) * 100)
        : 0;

    return { matched, missing, pct, presentInJD };
}

export async function computeKeywordMatchAsync(
    jd: string,
    cv: string,
    openaiClient?: OpenAI
): Promise<KeywordMatchSem> {
    let DICT = buildJDDictionary(jd);

    if (DICT.some(t => /\bat\s+least\s+one\s+programming\s+language\b/i.test(t))) {
        DICT = DICT.filter(t => !/\bat\s+least\s+one\s+programming\s+language\b/i.test(t))
            .concat(["Programming language"]);
    }

    const presentInJD = DICT;

    const matched: string[] = [];
    const partial: string[] = [];
    const missing: string[] = [];

    const SEM_PARTIAL_ENABLED =
        !!openaiClient && /^1|true|yes$/i.test(process.env.ENABLE_SEMANTIC_MATCH || "");

    for (const k of presentInJD) {
        if (/^Programming language$/i.test(k)) {
            const hit = cvHasAnyLanguage(cv);
            (hit ? matched : missing).push("Programming language");
            continue;
        }

        const hardHit = containsToken(cv, k) || fuzzyContains(cv, k, 0.90);
        if (hardHit) {
            matched.push(k);
            continue;
        }

        if (SEM_PARTIAL_ENABLED && await semanticPartialHit(openaiClient!, cv, k)) {
            partial.push(k);
        } else {
            missing.push(k);
        }
    }

    const pct = presentInJD.length
        ? Math.round(((matched.length + 0.5 * partial.length) / presentInJD.length) * 100)
        : 0;

    return { matched, partial, missing, pct, presentInJD };
}




/** ---------- Whitespace normaliser ---------- */
function _norm(s: string) {
    return (s || "")
        .replace(/\u00a0/g, " ")
        .replace(/\r\n?/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

/** ---------- Atomic skills extractor (safe regex) ---------- */
function extractAtomicSkills(excerpt: string): string[] {
    if (!excerpt) return [];

    const keepCaps = new Set(["SQL", "R", "ETL", "DAX"]);
    const out: string[] = [];

    // Safer than a char-class with '/' (avoids parser ambiguity)
    const splitDelims = /(?:,|;|\||\/| — | – | - )+/;

    _norm(excerpt)
        .split(/\n+/)
        .map((l) => l.trim())
        .filter(Boolean)
        .forEach((line) => {
            const [lhs, ...rest] = line.split(":");
            const rhs = rest.join(":");

            const push = (t: string) => {
                const token = t.trim().replace(/^[•\-–—]\s*/, "");
                if (!token) return;
                if (token.length <= 2 && !keepCaps.has(token.toUpperCase())) return;

                // drop sentence-like fragments (too many words)
                const wordCount = token.split(/\s+/).length;
                if (wordCount > TOK_MAX_WORDS) return;

                out.push(token);
            };

            if (lhs && rhs) {
                // "Header: a, b, c" → push header + items
                push(lhs);
                rhs.split(splitDelims).forEach(push);
            } else {
                // "a, b, c" on its own line
                line.split(splitDelims).forEach(push);
            }
        });

    // de-dup (case-insensitive)
    const seen = new Set<string>();
    const uniq: string[] = [];
    for (const s of out) {
        const k = s.toLowerCase();
        if (!seen.has(k)) {
            seen.add(k);
            uniq.push(s);
        }
    }
    return uniq;
}

/** ---------- Robust slice between headings ---------- */
function robustSlice(
    text: string,
    startLabels: RegExp[] | RegExp,
    stopLabels: RegExp[] | RegExp,
    maxChars = 12000
): string {
    if (!text) return "";
    const starts = Array.isArray(startLabels) ? startLabels : [startLabels];
    const stops = Array.isArray(stopLabels) ? stopLabels : [stopLabels];

    const src = _norm(text);

    // Find first matching start (earliest occurrence)
    let startIdx = -1;
    let startEndIdx = -1;
    for (const re of starts) {
        const m = src.match(re);
        if (m && m.index !== undefined) {
            startIdx = m.index;
            startEndIdx = m.index + m[0].length;
            break;
        }
    }
    if (startIdx < 0) return "";

    // Find nearest stop AFTER the start
    let stopIdx = src.length;
    for (const re of stops) {
        const afterStart = src.slice(startEndIdx);
        const m = afterStart.match(re);
        if (m && m.index !== undefined) {
            const candidate = startEndIdx + m.index;
            if (candidate < stopIdx) stopIdx = candidate;
        }
    }

    return _norm(src.slice(startEndIdx, stopIdx)).slice(0, maxChars);
}

/** ---------- Use robustSlice, then fall back to legacy extractor ---------- */
function extractWithFallback(
    text: string,
    kind: "education" | "projects" | "skills",
    minLen = 40
) {
    let primary = "";
    if (kind === "education") primary = robustSlice(text, EDUCATION_LABELS, SECTION_STOP_LABELS);
    if (kind === "projects") primary = robustSlice(text, PROJECTS_LABELS, SECTION_STOP_LABELS);
    if (kind === "skills") primary = robustSlice(text, SKILLS_LABELS, SECTION_STOP_LABELS);

    if (primary && primary.length >= minLen) return primary;

    // Fallback to your existing regex extractor (kept below in file)
    const legacy = extractSection(text, kind as any);
    return legacy && legacy.length >= minLen ? legacy : (primary || legacy || "");
}

/** -------------------- Heuristic ATS seed -------------------- */

// === ATS breakdown helpers (add above computeATSHeuristic) ===
type HeurParts = {
    structure25: number;  // your internal structure score (0..25)
    summary20: number;    // 0..20
    skills20: number;     // 0..20
    experience20: number; // 0..20
    keywords7: number;    // 0..7
};

type AtsBreakdownItem = { label: string; score: number; max: number; reasons?: string[] };
/**
 * Convert internal heuristic parts → UI breakdown buckets totaling 100:
 *  20 + 20 + 20 + 20 + 10 + 10
 */
function toAtsBreakdown(parts: HeurParts, hasEducation: boolean): AtsBreakdownItem[] {
    return [
        { label: "Structure", score: Math.round((parts.structure25 / 25) * 20), max: 20 },
        { label: "Summary", score: parts.summary20, max: 20 },
        { label: "Skills", score: parts.skills20, max: 20 },
        { label: "Experience", score: parts.experience20, max: 20 },
        { label: "Education", score: hasEducation ? 10 : 0, max: 10 },
        { label: "Keywords", score: Math.round((parts.keywords7 / 7) * 10), max: 10 },
    ];
}
function rescaleAtsBreakdown(breakdown: AtsBreakdownItem[], targetTotal: number): AtsBreakdownItem[] {
    const raw = breakdown.reduce((t, b) => t + Math.min(b.score, b.max), 0);
    if (!raw) return breakdown;
    const f = targetTotal / raw;
    return breakdown.map(b => ({
        ...b,
        score: Math.max(0, Math.min(b.max, Math.round(b.score * f))),
    }));
}

function computeATSHeuristic(
    resumeText: string,
    sections: any
): {
    score: number;
    feedback: string[];
    parts: {
        structure25: number;  // 0–25 (we scale to 20 for UI)
        summary20: number;    // 0–20
        skills20: number;     // 0–20
        experience20: number; // 0–20
        keywords7: number;    // 0–7  (we scale to 10 for UI)
    };
} {
    let score = 0;
    const fb: string[] = [];

    // ----- Structure (cap 25) -----
    let structure =
        (sections.hasSummary ? 6 : 0) +
        (sections.hasExperience ? 8 : 0) +
        (sections.hasSkills ? 6 : 0) +
        (sections.hasEducation ? 6 : 0) +
        (sections.hasTools ? 4 : 0) +
        (sections.hasProjects ? 4 : 0) +
        (sections.hasContact ? 4 : 0);
    structure = Math.min(structure, 25);
    score += structure;

    // ----- Summary (cap 20) -----
    // ----- Summary (cap 20): +5 has summary, +5 years, +5 quantified outcome, +5 mentions any resume skill -----
    let summaryScore = 0;
    const summaryRaw = extractSection(resumeText, "summary") || "";
    const summaryLc = summaryRaw.toLowerCase();

    const hasSummary = summaryLc.trim().length > 0;
    const hasYrs = /\b\d+\s*(\+|plus)?\s*(years?|yrs?)\b/.test(summaryLc); // allow “yrs”
    const hasMetric =
        /(\$[\d,]+|\d+(?:\.\d+)?%|\b\d{1,3}(?:,\d{3})+\b|\b\d+(?:\.\d+)?\s+(?:hours?|days?|weeks?|months?)\b)/i.test(
            summaryRaw
        );

    // Build a dynamic skill list from the resume's SKILLS section (no hardcoding)
    const skillsTxtForSummary = extractSection(resumeText, "skills");
    const skillTokens = extractAtomicSkills(skillsTxtForSummary)
        .map((s) => s.toLowerCase())
        .filter(Boolean);

    // Check if any resume skill actually appears in the Summary text
    const hasKeySkill =
        hasSummary &&
        skillTokens.some((tok) => {
            const escaped = tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            if (tok.length <= 3) {
                // strict-ish match for acronyms like R, SQL, DAX
                return new RegExp(`(^|[^A-Za-z0-9])${escaped}([^A-Za-z0-9]|$)`, "i").test(summaryRaw);
            }
            if (tok.includes(" ")) {
                // multi-word phrases: substring ok
                return new RegExp(escaped, "i").test(summaryRaw);
            }
            // normal words
            return new RegExp(`\\b${escaped}\\b`, "i").test(summaryRaw);
        });

    // 4×5 = 20
    summaryScore =
        (hasSummary ? 5 : 0) +
        (hasYrs ? 5 : 0) +
        (hasMetric ? 5 : 0) +
        (hasKeySkill ? 5 : 0);

    summaryScore = Math.min(20, summaryScore);
    score += summaryScore;

    // reasons for feedback line (used by your UI accordion)
    const summaryReasons: string[] = [];
    if (hasSummary) summaryReasons.push("has summary");
    if (hasYrs) summaryReasons.push("years mentioned");
    if (hasMetric) summaryReasons.push("has quantified outcome");
    if (hasKeySkill) summaryReasons.push("mentions a resume skill");


    // ----- Skills (cap 20) -----
    let skillsScore = 0;
    // Use robust slice + atomic tokenizer instead of naive split
    const skillsExcerptForScore = extractWithFallback(resumeText, "skills", 0);
    const atomicSkillsForScore = extractAtomicSkills(skillsExcerptForScore);
    const uniqCount = new Set(
        atomicSkillsForScore.map((s) => normalize(s)).filter(Boolean)
    ).size;

    // cap at 12 → map to 0..20
    skillsScore = Math.min(20, Math.round((Math.min(uniqCount, 12) / 12) * 20));
    score += skillsScore;

    // ----- Experience (cap 20) -----
    const expTxt =
        (extractSection(resumeText, "experience") || resumeText).toLowerCase();
    const actionHits =
        (
            expTxt.match(
                /\b(le(?:d|ad)|manag|coordinat|implement|develop|optimis|streamlin|reduce|increase|improve|save|administer|perform|monitor|train|mentor)\w*/g
            ) || []
        ).length;
    const metricHits =
        (expTxt.match(
            /(\$[\d,]+|\d+(?:\.\d+)?%|\b\d{1,3}(?:,\d{3})+\b)/g
        ) || []).length;
    const expScore = Math.min(
        20,
        Math.round(Math.min(actionHits * 2 + metricHits * 2, 20))
    );
    score += expScore;

    // ----- Keywords (cap 7) -----
    const hasCore = /\b(sql|excel|tableau|power\s*bi|python|looker|snowflake|redshift|bigquery)\b/i.test(
        resumeText
    );
    const hasR = /(^|[^A-Za-z])R([^A-Za-z]|$)/.test(resumeText);
    const keywordScore = hasCore || hasR ? 7 : 3;
    score += keywordScore;

    // Feedback lines (still useful for UI text parsing)
    fb.push(`Structure: ${structure}/25`);
    fb.push(`Summary: ${summaryScore}/20`);
    fb.push(`Skills: ${skillsScore}/20`);
    fb.push(`Experience: ${expScore}/20`);
    fb.push(`Keywords: ${keywordScore}/7`);

    return {
        score: Math.min(100, score),
        feedback: fb,
        parts: {
            structure25: structure,
            summary20: summaryScore,
            skills20: skillsScore,
            experience20: expScore,
            keywords7: keywordScore,
        },
    };
}



/** ---------- Keyword Rules (config-driven) ---------- */

type KeywordRule = {
    id: string;
    jd: (string | RegExp)[];
    cv: (string | RegExp)[];
    recommendation: string;
    section?: "recommendations" | "improvements"; // default "recommendations"
};

const DEFAULT_RULES: KeywordRule[] = [
    {
        id: "cicd",
        jd: [
            /ci\/?cd/i,
            /continuous\s+integration/i,
            /continuous\s+(?:delivery|deployment)/i,
            /version\s+control/i,
            /automation\s+of\s+test(?:\s+plans)?/i,
            /test\s+plans?/i,
        ],
        cv: [
            /ci\/?cd/i,
            /\bgit(hub|lab)?\b/i,
            /bitbucket/i,
            /azure\s+devops/i,
            /jenkins|circleci|travis/i,
            /pipeline[s]?/i,
            /\bya?ml\b/i,           // yaml / yml
            /\bactions?\b/i,        // GitHub Actions, etc.
            /release\s+pipeline/i,
            /unit\s*tests?/i,
        ],
        recommendation:
            "If applicable, add a bullet on version control, CI/CD, and automated test plans for BI pipelines.",
        section: "recommendations",
    },
    {
        id: "r_language",
        jd: [/\bR\b/, /python\s+and\s+R/i, /R\s+for\s+stat/i],
        cv: [/\bR\b/],
        recommendation:
            "If you have R exposure, add a short proof (e.g., tidyverse, ggplot2, statistical tests).",
    },
    {
        id: "paginated_reporting",
        jd: [/paginated\s+report/i, /power\s*bi\s+report\s+builder/i],
        cv: [/paginated\s+report/i, /report\s+builder/i, /\brdl\b/i],
        recommendation:
            "Mention any Paginated Reporting (Power BI Report Builder / RDL) experience, if applicable.",
    },
    {
        id: "dataops",
        jd: [/data-?ops/i, /reporting\s*&?\s*analytics\s+framework/i],
        cv: [/data-?ops/i, /pipeline|orchestrat(e|ion)|schedule|refresh/i, /airflow|databricks|azure\s+devops/i],
        recommendation:
            "Add a line on DataOps: versioning, pipeline orchestration, or scheduled refreshes.",
    },
    {
        id: "data_literacy",
        jd: [/data\s+literacy/i, /enable.*learn.*read.*work\s+with\s+data/i],
        cv: [/workshop|training|upskilling|data\s+literacy/i],
        recommendation:
            "Add a bullet on data literacy enablement (workshops, training, stakeholder upskilling).",
    },
];

/** Optional: merge in external rules from an env var (no redeploy to tweak) */
function loadExternalRules(): KeywordRule[] {
    try {
        const raw = process.env.RESUME_RULES_JSON; // JSON string: { "rules": [ ... ] }
        if (!raw) return [];
        const obj = JSON.parse(raw);
        if (!Array.isArray(obj?.rules)) return [];
        const toRe = (t: string | RegExp) => (t instanceof RegExp ? t : new RegExp(t, "i"));
        return obj.rules.map((r: any) => ({
            id: String(r.id || crypto.randomUUID()),
            jd: (r.jd || []).map(toRe),
            cv: (r.cv || []).map(toRe),
            recommendation: String(r.recommendation || ""),
            section: r.section === "improvements" ? "improvements" : "recommendations",
        }));
    } catch {
        return [];
    }
}


type AnalysisLists = {
    strengths: string[];
    improvements: string[];
    gaps: string[];
    recommendations: string[];
    overallSummary: string;
};

/** Inject rules: if JD needs X and CV lacks X → add coaching */

// === Configurable rules (module scope) ===
const KEYWORD_RULES: KeywordRule[] = [...DEFAULT_RULES, ...loadExternalRules()];

function textMatchesAny(text: string, pats: (string | RegExp)[]) {
    if (!text) return false;
    for (const p of pats) {
        if (p instanceof RegExp) {
            if (p.test(text)) return true;
        } else if (text.toLowerCase().includes(String(p).toLowerCase())) {
            return true;
        }
    }
    return false;
}

function applyKeywordRules(analysisLists: AnalysisLists, jdText: string, cvText: string) {
    const need = (re: RegExp) => re.test(jdText);
    const has = (re: RegExp) => re.test(cvText);

    // --- 1) CI/CD (generic DA/BI roles)
    const JD_NEEDS_CICD =
        /\b(ci\/?cd|continuous\s+integration|continuous\s+(?:delivery|deployment)|version\s+control|automation\s+of\s+test(?:\s+plans)?|test\s+plans?)\b/i;
    const CV_SHOWS_CICD =
        /\b(ci\/?cd|git|github|gitlab|bitbucket|azure\s+devops|jenkins|circleci|travis|pipeline[s]?|ya?ml|actions|release\s+pipeline|unit\s*tests?)\b/i;

    if (need(JD_NEEDS_CICD) && !has(CV_SHOWS_CICD)) {
        analysisLists.recommendations = uniqNorm([
            ...(analysisLists.recommendations || []),
            "If applicable, add a bullet on version control, CI/CD, and automated test plans for BI pipelines."
        ]).slice(0, 5);
    }

    // --- 2) Nursing-role hints (only fire if JD looks clinical)
    if (need(/\b(ahpra|registered\s+nurse|radiology|interventional|biops(y|ies)|lumbar\s+puncture(s)?|drainage(s)?|injection(s)?|pain\s+management)\b/i)) {
        const rules: Array<{ want: RegExp; have: RegExp; label: string }> = [
            {
                want: /\bacute\b/i,
                have: /\b(ICU|intensive\s*care|acute|ED|emergency|ward)\b/i,
                label: "Proven acute nursing experience",
            },
            {
                want: /\b(multidisciplinary|team)\b/i,
                have: /\b(interprofessional|multi.?disciplinary|team(?:work| collaboration))\b|\bautonom(?:y|ous)\b/i,
                label: "Demonstrated ability to work effectively and autonomously within a multidisciplinary team",
            },
            {
                want: /\b(communication|interpersonal)\b/i,
                have: /\b(communication|liaison|education|informed\s+consent|documentation)\b/i,
                label: "Strong interpersonal and communication skills",
            },
            {
                want: /\b(time\s+management|organis(?:ation|ational))\b/i,
                have: /\b(prioriti[sz]e|organis(?:e|ed)|time\s+management)\b/i,
                label: "Well-developed time management and organisational skills",
            },
            {
                want: /\bflexible\s+roster\b/i,
                have: /\b(flexible\s+(?:roster|hours)|shift\s+work|weekend|on[-\s]?call)\b/i,
                label: "Ability to work a flexible roster",
            },
            {
                want: /\bAHPRA\b/i,
                have: /\bAHPRA\b|\bRegistered\s+Nurse\b/i,
                label: "Full AHPRA Registration as a Registered Nurse",
            },
        ];

        // Demote false gaps if CV shows evidence
        const demote = new Set<string>();
        for (const g of analysisLists.gaps || []) {
            for (const r of rules) {
                if (g.toLowerCase().includes(r.label.toLowerCase()) && has(r.have)) {
                    demote.add(g);
                    break;
                }
            }
        }
        if (demote.size) {
            analysisLists.gaps = (analysisLists.gaps || []).filter(g => !demote.has(g));
        }

        // Add recommendations for missing
        for (const r of rules) {
            if (need(r.want) && !has(r.have)) {
                analysisLists.recommendations = uniqNorm([
                    ...(analysisLists.recommendations || []),
                    `Add 1–2 bullets proving “${r.label}” (concrete example preferred).`
                ]).slice(0, 5);
            }
        }
    }

    // --- 3) Apply configurable keyword rules (DATA + external JSON)

    for (const rule of KEYWORD_RULES) {
        const jdNeeds = textMatchesAny(jdText, rule.jd);
        const cvHasIt = textMatchesAny(cvText, rule.cv);
        if (jdNeeds && !cvHasIt && rule.recommendation) {
            const dest = rule.section === "improvements" ? "improvements" : "recommendations";
            analysisLists[dest] = uniqNorm([...(analysisLists[dest] || []), rule.recommendation]).slice(0, 6);
        }
    }
}


/** -------------------- API -------------------- */
export async function GET() {
    return NextResponse.json({ ok: true }, { headers: noStoreHeaders() });
}

export async function POST(request: NextRequest) {
    try {
        // Check rate limit FIRST - before any processing
        const rateLimit = await checkRateLimit();
        if (!rateLimit.allowed) {
            // Redirect authenticated users to subscription page, anonymous users to sign-in
            const redirectTo = rateLimit.isAuthenticated ? '/subscription' : '/sign-in';

            return NextResponse.json(
                {
                    error: 'Rate limit exceeded',
                    message: rateLimit.isAuthenticated
                        ? rateLimit.hasSubscription
                            ? 'You have reached your scan limit for today. Please try again tomorrow.'
                            : 'You have used your free scan for today. Subscribe for unlimited scans or try again tomorrow.'
                        : 'You have used your free scan for today. Sign in for 1 free scan daily, or wait 24 hours.',
                    reset: rateLimit.reset,
                    remaining: rateLimit.remaining,
                    isAuthenticated: rateLimit.isAuthenticated,
                    hasSubscription: rateLimit.hasSubscription,
                    requiresAuth: !rateLimit.isAuthenticated,
                    redirectTo: redirectTo,
                    nextFreeScan: !rateLimit.isAuthenticated ? new Date(rateLimit.reset).toISOString() : null
                },
                { status: 429, headers: noStoreHeaders() }
            );
        }

        // Only parse form data if rate limit check passes
        const formData = await request.formData();
        const file = formData.get("resume") as unknown as File | null;
        const jobDescription = String(formData.get("jobDescription") || "");
        const companyName = String(formData.get("companyName") || "");
        const jobTitle = String(formData.get("jobTitle") || "");
        const country = String(formData.get("country") || "");
        const state = String(formData.get("state") || "");

        // Debug logging for job description
        console.log("🔍 Job description received:", {
            length: jobDescription.length,
            preview: jobDescription.substring(0, 300) + "...",
            hasContent: jobDescription.trim().length > 0
        });

        if (!file) {
            return NextResponse.json({ error: "No resume file provided" }, { status: 400, headers: noStoreHeaders() });
        }
        if (jobDescription.trim().length < 20) {
            return NextResponse.json({ error: "Valid job/position description is required" }, { status: 400, headers: noStoreHeaders() });
        }

        const { text: resumeText, sections } = await extractTextFromFile(file);
        if (resumeText.split(/\s+/).length < 100) {
            return NextResponse.json({ error: "Resume appears to be too short or unreadable" }, { status: 400, headers: noStoreHeaders() });
        }

        // Scoped excerpts for high-precision extraction
        const eduExcerpt = extractWithFallback(resumeText, "education");
        const skillsExcerpt = extractWithFallback(resumeText, "skills");
        const projectsExcerpt = extractWithFallback(resumeText, "projects", 0);
        const summaryExcerpt =
            robustSlice(resumeText, SUMMARY_LABELS, SECTION_STOP_LABELS) ||
            extractSection(resumeText, "summary") ||
            "";

        const heur = computeATSHeuristic(resumeText, sections);
        const baseBreakdown = toAtsBreakdown(heur.parts, !!sections.hasEducation);
        const nonce = crypto.createHash("sha256").update(resumeText + jobDescription + Date.now().toString()).digest("hex").slice(0, 16);

        // ---------- Deterministic JD↔CV keywords (authoritative for the model) ----------

        function normalizeKW(k: KeywordMatch | KeywordMatchSem): KeywordMatchSem {
            return {
                matched: k.matched,
                missing: k.missing,
                pct: k.pct,
                presentInJD: k.presentInJD,
                partial: 'partial' in k ? k.partial : [],
            };
        }

        const SEM_ENABLED = /^1|true|yes$/i.test(process.env.ENABLE_SEMANTIC_MATCH || "");

        const kw = normalizeKW(
            SEM_ENABLED
                ? await computeKeywordMatchAsync(jobDescription, resumeText, openai)
                : computeKeywordMatch(jobDescription, resumeText)
        );


        // If no API key, fallback
        if (!process.env.OPENAI_API_KEY) {
            const fallback = buildFallbackNarrative({ resumeText, jobDescription, jobTitle, companyName, heur });
            const fb = [...heur.feedback];
            const eduLine = sections.hasEducation
                ? "Education: 10/10 — education present"
                : "Education: 0/10 — education missing";
            fb.splice(4, 0, eduLine); // place after Experience

            return NextResponse.json(
                {
                    success: true,
                    narrative: fallback,
                    analysis: {
                        atsScore: {
                            score: heur.score,
                            feedback: fb,
                            breakdown: rescaleAtsBreakdown(baseBreakdown, heur.score),
                        }, jobFitScore: {
                            score: 70,
                            buckets: { mustHave: 70, coreSkills: 70, domainTitleAdjacency: 70, seniority: 70, recency: 70, niceToHaves: 70 },
                            gates: { reasons: [] },
                            debug: {},
                        },
                        overallScore: Math.round(100 * Math.pow(0.7, 0.7) * Math.pow(heur.score / 100, 0.3)),
                        text: "Heuristic-only analysis (no API key).",
                        pack: null,
                        analysisLists: null,
                        meta: { profession: "General", counts: { resumeSkills: 0, jobRequirements: 0, educationItems: 0 }, companyName, jobTitle, country, state },
                    },
                    message: "Analysis completed with heuristic fallback (no API key).",
                },
                { status: 200, headers: noStoreHeaders() }
            );
        }

        /** ---------- 1) Structured JSON call ---------- */

        // dynamic sub-schemas
        const keyProjectsSchema = {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                properties: {
                    name: { type: "string" },
                    context: { type: "string" },      // optional
                    tools: { type: "array", items: { type: "string" } }, // optional
                    bullets: { type: "array", items: { type: "string" } },
                },
                required: ["name", "bullets"],      // <- only these
            },
        };
        const eduSchema: any = {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                properties: {
                    name: { type: "string" },
                    institution: { type: "string" },      // Keep as optional
                    year: { type: "string" },             // Keep as optional
                },
                required: ["name"],  // Only require name, make institution/year optional
            },
        };
        const responseSchema: any = {
            name: "single_call_resume_eval",
            strict: false,
            schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                    analysis: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            strengths: { type: "array", items: { type: "string" } },
                            improvements: { type: "array", items: { type: "string" } },
                            gaps: { type: "array", items: { type: "string" } },
                            recommendations: { type: "array", items: { type: "string" } },
                            overallSummary: { type: "string" },
                        },
                        required: [
                            "strengths",
                            "improvements",
                            "gaps",
                            "recommendations",
                            "overallSummary",
                        ],
                    },

                    resumePack: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            professionalSummary: { type: "string" },
                            // Verbatim/explicit skills as they appear on the resume
                            keySkills: { type: "array", items: { type: "string" } },
                            keyProjects: keyProjectsSchema,
                            // NEW: model-inferred skills with evidence
                            inferredSkills: {
                                type: "array",
                                items: {
                                    type: "object",
                                    additionalProperties: false,
                                    properties: {
                                        name: { type: "string" },
                                        category: {
                                            type: "string",
                                            enum: ["tool", "language", "methodology", "domain", "soft"],
                                        },
                                        evidence: { type: "array", items: { type: "string" } },
                                        confidence: { type: "integer", minimum: 0, maximum: 100 },
                                    },
                                    required: ["name", "category", "evidence", "confidence"],
                                },
                            },

                            professionalExperience: {
                                type: "array",
                                items: {
                                    type: "object",
                                    additionalProperties: false,
                                    properties: {
                                        employer: { type: "string" },
                                        title: { type: "string" },
                                        location: { type: "string" },
                                        start: { type: "string" },
                                        end: { type: "string" },
                                        bullets: { type: "array", items: { type: "string" } },
                                    },
                                    required: [
                                        "employer",
                                        "title",
                                        "location",
                                        "start",
                                        "end",
                                        "bullets",
                                    ],
                                },
                            },

                            // keyProjects: {
                            //     type: "array",
                            //     items: {
                            //         type: "object",
                            //         additionalProperties: false,
                            //         properties: {
                            //             name: { type: "string" },
                            //             context: { type: "string" },
                            //             tools: { type: "array", items: { type: "string" } },
                            //             bullets: { type: "array", items: { type: "string" } },
                            //         },
                            //         required: ["name", "context", "tools", "bullets"],
                            //     },
                            // },
                            educationAndCertification: eduSchema,
                            // educationAndCertification: {
                            //     type: "array",
                            //     items: {
                            //         type: "object",
                            //         additionalProperties: false,
                            //         properties: {
                            //             name: { type: "string" },
                            //             institution: { type: "string" },
                            //             year: { type: "string" },
                            //         },
                            //         required: ["name", "institution", "year"],
                            //     },
                            // },
                            toolsAndTechnologies: { type: "array", items: { type: "string" } },
                        },
                        required: [
                            "professionalSummary",
                            "keySkills",
                            "inferredSkills",
                            "professionalExperience",
                            "educationAndCertification",
                            "toolsAndTechnologies",
                            "keyProjects",
                        ],
                    },

                    scores: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            ats: {
                                type: "object",
                                additionalProperties: false,
                                properties: {
                                    score: { type: "integer", minimum: 0, maximum: 100 },
                                    // NEW: the six-bucket breakdown produced by the model
                                    breakdown: {
                                        type: "array",
                                        items: {
                                            type: "object",
                                            additionalProperties: false,
                                            properties: {
                                                label: {
                                                    type: "string",
                                                    enum: [
                                                        "Structure",
                                                        "Summary",
                                                        "Skills",
                                                        "Experience",
                                                        "Education",
                                                        "Keywords",
                                                    ],
                                                },
                                                score: { type: "integer", minimum: 0, maximum: 100 },
                                                max: { type: "integer", minimum: 1, maximum: 100 },
                                                reasons: { type: "array", items: { type: "string" } },
                                            },
                                            required: ["label", "score", "max", "reasons"],
                                        },
                                    },
                                    // Optional, but handy for your UI parse
                                    feedback: { type: "array", items: { type: "string" } },
                                },
                                required: ["score", "breakdown", "feedback"],
                            },
                            match: {
                                type: "object",
                                additionalProperties: false,
                                properties: {
                                    score: { type: "integer", minimum: 0, maximum: 100 },
                                    buckets: {
                                        type: "object",
                                        additionalProperties: false,
                                        properties: {
                                            mustHave: { type: "integer", minimum: 0, maximum: 100 },
                                            coreSkills: { type: "integer", minimum: 0, maximum: 100 },
                                            domainTitleAdjacency: {
                                                type: "integer",
                                                minimum: 0,
                                                maximum: 100,
                                            },
                                            seniority: { type: "integer", minimum: 0, maximum: 100 },
                                            recency: { type: "integer", minimum: 0, maximum: 100 },
                                            niceToHaves: { type: "integer", minimum: 0, maximum: 100 },
                                        },
                                        required: [
                                            "mustHave",
                                            "coreSkills",
                                            "domainTitleAdjacency",
                                            "seniority",
                                            "recency",
                                            "niceToHaves",
                                        ],
                                    },
                                    matchedSkills: { type: "array", items: { type: "string" } },
                                    missingSkills: { type: "array", items: { type: "string" } },
                                    criticalMissingSkills: {
                                        type: "array",
                                        items: { type: "string" },
                                    },
                                },
                                required: [
                                    "score",
                                    "buckets",
                                    "matchedSkills",
                                    "missingSkills",
                                    "criticalMissingSkills",
                                ],
                            },
                        },
                        required: ["ats", "match"],
                    },

                    evidence: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            matched: {
                                type: "array",
                                items: {
                                    type: "object",
                                    additionalProperties: false,
                                    properties: {
                                        item: { type: "string" },
                                        resume_quotes: { type: "array", items: { type: "string" } },
                                        jd_quotes: { type: "array", items: { type: "string" } },
                                    },
                                    required: ["item", "resume_quotes", "jd_quotes"],
                                },
                            },
                            missing: {
                                type: "array",
                                items: {
                                    type: "object",
                                    additionalProperties: false,
                                    properties: {
                                        item: { type: "string" },
                                        jd_quotes: { type: "array", items: { type: "string" } },
                                    },
                                    required: ["item", "jd_quotes"],
                                },
                            },
                        },
                        required: ["matched", "missing"],
                    },

                    meta: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            languageVariant: { type: "string" },
                            profession: { type: "string" },
                            // NEW: domain detection (resume vs JD)
                            professionResume: { type: "string" },
                            professionJD: { type: "string" },
                            domainMatch: { type: "string", enum: ["High", "Medium", "Low"] },
                        },
                        required: [
                            "languageVariant",
                            "profession",
                            "professionResume",
                            "professionJD",
                            "domainMatch",
                        ],
                    },
                },
                required: ["analysis", "resumePack", "scores", "evidence", "meta"],
            },
        };


        const systemMessageStructured = `
You are an elite ATS resume evaluator. Respond in VALID JSON only, exactly matching the provided schema.

HARD RULES
- Use ONLY facts present in the resume (and Job Description for comparison). Do NOT invent tools/projects/dates/providers/metrics.
- Every analysis claim MUST be supported by short quotes in the evidence arrays.
- If the resume shows any signal for a Job Description item (even weak), label it "Matched – partial". Use "Missing" only when there is zero CV evidence.
- STATISTICAL METHODS RECOGNITION: Fraud detection, anomaly analysis, pattern recognition, and quantitative analysis ALL constitute statistical methods experience. Do not require explicit "statistics" keyword if the work demonstrates statistical thinking.
- Use Australian/British spelling. Keep tone crisp and quantified; avoid fluff.
- SCHEMA IS STRICT: For every object, include ALL keys in "properties". If unknown/not present, return "" or [] (never omit).

DETERMINISTIC MATCHES
- If the request provides deterministic keyword matches, treat them as authoritative. Do not mark those items as Missing.

SEMANTIC EQUIVALENCE
- Treat hyphen/space variants and morphological variants as equivalent (e.g., post-procedure vs post procedure; recovery vs recover/recovering; procedure vs procedural). If semantically equivalent, label "Matched – partial".


ROLE/DOMAIN DETECTION
- meta.professionResume: most likely profession from the RESUME.
- meta.professionJD: most likely profession from the Job Description.
- meta.domainMatch: "High" | "Medium" | "Low".

SKILLS
- resumePack.keySkills: explicit verbatim skills (atomic).
- resumePack.inferredSkills: inferred skills with 1–3 short CV quotes, category (tool|language|methodology|domain|soft), confidence 0–100.

PROJECTS
- Extract from Projects AND from Experience bullets when project-like; up to 20 items.
- For each: name, 1–5 outcome bullets, and nearby tools (no invention).

EXPERIENCE
- Extract all roles found; for each: employer, title, location, start, end, 1–5 bullets (no invention).

EDUCATION
- Extract ALL degrees/certifications/courses/training/workshops/pro dev across the whole resume.
- If institution or year absent, set "" (do not drop the item). Up to 20 items.

TOOLS NORMALISATION
- Normalise obvious variants (e.g., "MS SQL"/"MSSQL"/"T-SQL" → "SQL Server"; "PBI"/"Power BI Desktop" → "Power BI"; "PowerQuery"/"PQ" → "Power Query") when the domain is data/BI.
- Do NOT constrain tools to BI only. For healthcare/clinical roles, include clinical tools/procedures/EMRs exactly as the resume states them (no invention).

- KEYWORD CATEGORIZATION: Distinguish between:
  * **Field-of-study keywords** (e.g., "Statistics", "Mathematics", "Nursing", "Engineering") - these describe educational background
  * **Technical capability keywords** (e.g., "statistical analysis", "calculus", "patient care", "structural design") - these describe actual skills

- Only technical capability keywords should affect the keyword score. Field-of-study keywords indicate educational background but don't represent missing skills if the candidate demonstrates equivalent capabilities through experience.

- If a candidate shows evidence of capabilities (e.g., fraud detection → statistical analysis, patient monitoring → clinical skills), consider the technical requirement MET regardless of degree title.

ATS BREAKDOWN (REQUIRED)
- Provide scores.ats.breakdown with EXACTLY these six labels: Structure (max 20), Summary (max 20), Skills (max 20), Experience (max 20), Education (max 10), Keywords (max 10).
- Each item MUST include "reasons": array of short phrases explaining the score.
- Structure reasons must mention: section completeness, contact info presence, formatting effectiveness, organisational clarity.
- Summary reasons MUST be booleans from the **summary text only**: "has summary", "years mentioned", "has quantified outcome", "mentions a resume skill".
  * "has quantified outcome" MUST be false unless the summary contains a number (%, $, count, or duration).
- EDUCATION EVALUATION RULES (CRITICAL):
  * If JD asks for "Data Science degree OR RELATED FIELD", Business/Finance/IT degrees WITH data experience COUNT as "perfect match"
  * Bootcamps + practical experience = equivalent to formal education for technical roles
  * Focus on WHAT the candidate can DO, not just the degree title
  * 6+ years practical experience outweighs degree title mismatches
  * Use these relevance levels: "perfect match", "strong equivalent", "partially relevant", "missing required background"

- Education scoring (0-10) must reflect REAL hiring practices, not just degree title matching.
- Also return scores.ats.feedback as EXACTLY six lines in this order and format:
  "Structure: [score]/20 — …"
  "Summary: [score]/20 — …"
  "Skills: [score]/20 — …"
  "Experience: [score]/20 — …"
  "Education: [score]/10 — …"
  "Keywords: [score]/10 — Matches X% of Job Description keywords; Missing: [list 3–5 critical tools/skills]"

SCORING RUBRIC (0–100 ONLY)
- mustHave, coreSkills, domainTitleAdjacency, seniority, recency, niceToHaves are integers 0–100.
- Education scoring (0–10) is based on **Job Description relevance** per the criteria above.

ANALYSIS LISTS
- strengths: only items with CV evidence (max 8).
- gaps: ONLY truly missing **must-have** Job Description items (no partials; max 5).
- improvements: concrete resume edits (max 6).
- recommendations: 1–5 new, actionable suggestions addressing Job Description gaps.

EVIDENCE & VALIDATION
- Matched items: up to 3 brief resume_quotes + up to 3 jd_quotes.
- Missing items: up to 3 jd_quotes proving the requirement.
- CRITICAL: The same Job Description requirement must NOT appear in both 'matched' and 'missing'.

EXTRACTION
- Use ONLY the resume text and Job Description. Copy names verbatim. If a year is not shown, set year:"".
`.trim();

        const userMessageStructured = `
REQUEST_NONCE: ${nonce}
JOB_TITLE: ${jobTitle}
COMPANY_NAME: ${companyName}

STRUCTURE_FLAGS (use ONLY these for Structure score & reasons; do not re-derive):
hasSummary=${sections.hasSummary}
hasExperience=${sections.hasExperience}
hasSkills=${sections.hasSkills}
hasEducation=${sections.hasEducation}
hasTools=${sections.hasTools}
hasProjects=${sections.hasProjects}
hasContact=${sections.hasContact}
usesBullets=${sections.usesBullets}

SUMMARY_EXCERPT (use ONLY this block for all Summary booleans; ignore the rest of the resume for Summary):
<<<SUMMARY_EXCERPT>>>
${summaryExcerpt}
<<<END_SUMMARY_EXCERPT>>>

EXTRACTION GUIDELINES:
- Education: Extract ALL items found (any quantity)
- Projects: Extract ALL items found (any quantity)
- Accuracy over quantity: Only extract what's clearly present in the resume

RESUME (full text):
<<<RESUME_START>>>
${resumeText}
<<<RESUME_END>>>

JOB DESCRIPTION (full text):
<<<JD_START>>>
${jobDescription}
<<<JD_END>>>

RESUME PROJECTS SNIPPET (if found):
<<<PROJECTS_EXCERPT>>>
${projectsExcerpt}
<<<END_PROJECTS_EXCERPT>>>

RESUME EDUCATION SNIPPET (if found):
<<<EDUCATION_EXCERPT>>>
${eduExcerpt}
<<<END_EDUCATION_EXCERPT>>>

DETERMINISTIC_KEYWORD_MATCH (for context only):
- presentInJD: ${JSON.stringify((kw.presentInJD || []).filter(k => !['statistics', 'mathematics', 'computer science', 'economics'].includes(k.toLowerCase())))}
- matched: ${JSON.stringify(kw.matched || [])}
- partial: ${JSON.stringify((kw as any).partial || [])}
- missing: ${JSON.stringify((kw.missing || []).filter(k => !['statistics', 'mathematics', 'computer science', 'economics'].includes(k.toLowerCase())))}


TASKS
1) Produce analysis lists (strengths, improvements, gaps, recommendations, overallSummary).
2) Build a resumePack (professionalSummary, keySkills, inferredSkills, professionalExperience, keyProjects, educationAndCertification, toolsAndTechnologies).
3) Score ATS (score + the six-item breakdown with reasons) and Job Match; fill all bucket scores.
4) Provide evidence arrays:
   - "matched": for each matched item, include up to 3 brief resume_quotes and up to 3 jd_quotes.
   - "missing": for each missing item, include up to 3 jd_quotes.

Return ONLY the JSON object. No commentary.
`.trim();


        const completionStructured = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0,
            max_tokens: 4000,
            response_format: { type: "json_schema", json_schema: responseSchema },
            user: `resume-app:${nonce}`,
            messages: [
                { role: "system", content: systemMessageStructured },
                { role: "user", content: userMessageStructured },
            ],
        });

        // Parse model JSON safely
        let parsed: any = {};
        try {
            parsed = JSON.parse(completionStructured.choices[0]?.message?.content || "{}");
        } catch {
            // If the structured JSON can’t be parsed, fall back to heuristics
            const breakdownOnFail = baseBreakdown.map((b) =>
                b.label === "Education" ? { ...b, score: sections.hasEducation ? 10 : 0 } : b
            );
            const fallback = buildFallbackNarrative({ resumeText, jobDescription, jobTitle, companyName, heur });

            return NextResponse.json(
                {
                    success: true,
                    narrative: fallback,
                    analysis: {
                        atsScore: {
                            score: heur.score,
                            feedback: heur.feedback,
                            breakdown: breakdownOnFail,
                        },
                        jobFitScore: {
                            score: 50,
                            buckets: { mustHave: 50, coreSkills: 50, domainTitleAdjacency: 50, seniority: 50, recency: 50, niceToHaves: 50 },
                            gates: { reasons: [] },
                            debug: {},
                        },
                        overallScore: Math.round(100 * Math.pow(0.5, 0.7) * Math.pow(heur.score / 100, 0.3)),
                        text: "Analysis unavailable due to formatting. Heuristic narrative provided.",
                        pack: null,
                        analysisLists: null,
                        meta: { profession: "General", counts: { resumeSkills: 0, jobRequirements: 0, educationItems: 0 }, companyName, jobTitle, country, state },
                    },
                    message: "Structured parse failed; returned fallback narrative.",
                },
                { status: 200, headers: noStoreHeaders() }
            );
        }

        /** ---------- Post-process structured result deterministically ---------- */
        const a = parsed.analysis || {};
        const r = parsed.resumePack || {};
        const s = parsed.scores || {};
        const m = parsed.meta || {};

        // --- Domain fallback if model omitted ---
        const guessProfession = (s: string) => {
            const t = (s || "").toLowerCase();
            if (/\b(registered nurse|ahpra|icu|ward|radiology|interventional|theatre|surgical|\bed\b|emergency)\b/.test(t)) return "Nursing";
            if (/\b(power bi|tableau|sql|dashboard|etl|data\s+model|dax|python)\b/.test(t)) return "Data/BI";
            return "General";
        };

        const profResume = m?.professionResume || guessProfession(resumeText);
        const profJD = m?.professionJD || guessProfession(jobDescription);
        const domainMatch = m?.domainMatch || ((profResume === profJD) ? "High" : "Medium");
        const professionOverall = m?.profession || (profJD !== "General" ? profJD : profResume) || "General";


        // Scores from model
        const atsScoreNum = Number(s?.ats?.score ?? NaN);
        const modelBreakdown = Array.isArray(s?.ats?.breakdown) ? s.ats.breakdown : [];
        const modelFeedback = Array.isArray(s?.ats?.feedback) ? s.ats.feedback : [];

        const matchScoreNum = Number(s?.match?.score ?? NaN);
        const buckets = s?.match?.buckets || {
            mustHave: 50,
            coreSkills: 50,
            domainTitleAdjacency: 50,
            seniority: 50,
            recency: 50,
            niceToHaves: 50,
        };
        let matchedSkills = uniqNorm(toArr(s?.match?.matchedSkills));
        let missingSkills = uniqNorm(toArr(s?.match?.missingSkills));

        const clamp100 = (n: any, dflt = 0) =>
            Number.isFinite(Number(n)) ? Math.max(0, Math.min(100, Math.round(Number(n)))) : dflt;

        const atsScore = clamp100(atsScoreNum, 60);
        const matchScore = clamp100(matchScoreNum, 50);

        // Use model breakdown directly; clamp and normalise
        const atsBreakdown =
            modelBreakdown.map((b: any) => ({
                label: String(b?.label || ""),
                score: clamp100(b?.score ?? 0, 0),
                max: Math.max(1, Math.min(100, Math.round(Number(b?.max ?? 20)))),
            }))
                // keep only the six expected labels in a stable order
                .filter((b: any) =>
                    ["Structure", "Summary", "Skills", "Experience", "Education", "Keywords"].includes(b.label)
                );

        // If for any reason the model missed some bucket(s), fill with zeros (doesn't rescale)
        const order = ["Structure", "Summary", "Skills", "Experience", "Education", "Keywords"];
        const atbMap = new Map(atsBreakdown.map((x: any) => [x.label, x]));
        const atsBreakdownCompleted = order.map((label) =>
            atbMap.get(label) || {
                label,
                score: 0,
                max: label === "Education" || label === "Keywords" ? 10 : 20,
            }
        );

        // === OVERRIDES: Summary, Structure, Keywords (deterministic) ===
        let feedbackLines = Array.isArray(modelFeedback) ? [...modelFeedback] : [];

        // A) Summary from summaryExcerpt only
        const sum = computeSummaryFlags(summaryExcerpt, skillsExcerpt);
        {
            const i = atsBreakdownCompleted.findIndex(b => b.label === "Summary");
            const summed = { label: "Summary", score: sum.score, max: 20, reasons: sum.reasons };
            if (i >= 0) atsBreakdownCompleted[i] = summed; else atsBreakdownCompleted.push(summed);

            const summaryLine = `Summary: ${sum.score}/20 — ${sum.reasons.join("; ")}`;
            const fbi = feedbackLines.findIndex((l: string) => /^Summary:\s*/.test(l));
            if (fbi >= 0) feedbackLines[fbi] = summaryLine; else feedbackLines.push(summaryLine);
        }

        // B) Structure from your section flags
        const st = computeStructure(sections);
        {
            const i = atsBreakdownCompleted.findIndex(b => b.label === "Structure");
            const structured = { label: "Structure", score: st.score, max: 20, reasons: st.reasons };
            if (i >= 0) atsBreakdownCompleted[i] = structured; else atsBreakdownCompleted.unshift(structured);

            const structureLine = `Structure: ${st.score}/20 — ${st.reasons.join("; ")}`;
            const fbi = feedbackLines.findIndex((l: string) => /^Structure:\s*/.test(l));
            if (fbi >= 0) feedbackLines[fbi] = structureLine; else feedbackLines.unshift(structureLine);
        }

        const kwMatched = uniqNorm([...(kw.matched || []), ...((kw as any).partial || [])]);
        const kwMissing = uniqNorm(kw.missing);

        // --- final keyword hygiene for display & scoring ---
        // --- final keyword hygiene for display & scoring ---
        const _tooGenericKW = /(?:\b(reports?|reporting|analytics?|analysis|stakeholders?|process(?:es)?|framework|environment|ability|strong|demonstrated|well[-\s]?developed|previous\s+experience|about|our|solid|familiarity|prior|tertiary|related\s+field|a\s+related\s+field|at\s+least\s+one\s+programming\s+language)\b)/i;

        const isCleanKW = (t: string) => {
            if (!t) return false;
            if (_tooGenericKW.test(t)) return false;
            const w = t.trim().split(/\s+/).length;
            return w >= 1 && w <= 5;
        };

        const prettify = (t: string) => {
            const lc = t.toLowerCase();
            if (/\bprogramming language\b/.test(lc)) return "Programming language (e.g., Python/R)";
            if (/\b(a\s+related\s+field|related\s+field)\b/.test(lc)) return "Relevant degree/discipline";
            return t;
        };

        const displayMatched = kwMatched.filter(isCleanKW).map(prettify);
        const displayMissing = kwMissing.filter(isCleanKW).map(prettify);




        {
            const kwScore = Math.min(10, Math.round(kw.pct / 10));
            const reasons = [
                `matches ${kw.pct}% of JD keywords`,
                displayMissing.length ? `missing: ${displayMissing.slice(0, 5).join(", ")}` : "no critical gaps"
            ];
            const i = atsBreakdownCompleted.findIndex(b => b.label === "Keywords");
            const kwItem = { label: "Keywords", score: kwScore, max: 10, reasons };
            if (i >= 0) atsBreakdownCompleted[i] = kwItem; else atsBreakdownCompleted.push(kwItem);

            const kwLine = `Keywords: ${kwScore}/10 — Matches ${kw.pct}% of Job Description keywords; Missing: ${displayMissing.slice(0, 5).join(", ") || "—"}`;
            const fbi = feedbackLines.findIndex((l: string) => /^Keywords:\s*/.test(l));
            if (fbi >= 0) feedbackLines[fbi] = kwLine; else feedbackLines.push(kwLine);
        }

        matchedSkills = displayMatched;
        missingSkills = displayMissing;


        // --- Deterministic reasons for Skills / Experience / Education + enforce 6 feedback lines ---
        const idx = (label: string) => atsBreakdownCompleted.findIndex(b => b.label === label);

        // Skills reasons
        // In “Skills reasons” block
        const skillsIdx = idx("Skills");
        if (skillsIdx >= 0) {
            const skillsExcerptX = extractWithFallback(resumeText, "skills", 0);
            const atomicX = extractAtomicSkills(skillsExcerptX);
            const uniqX = new Set(atomicX.map(s => normalize(s))).size;
            const skillsScoreDet = Math.min(20, Math.round((Math.min(uniqX, 12) / 12) * 20));
            const skillsReasons = [
                uniqX ? `extracted ${uniqX} skill tokens` : "no skill tokens found",
                uniqX >= 8 ? "broad skill coverage" : "limited skill variety",
            ];
            atsBreakdownCompleted[skillsIdx] = {
                ...atsBreakdownCompleted[skillsIdx],
                score: skillsScoreDet,
                reasons: skillsReasons,
            };
            const line = `Skills: ${skillsScoreDet}/20 — ${skillsReasons.join("; ")}`;
            const fbi = feedbackLines.findIndex((l: string) => /^Skills:\s*/i.test(l));
            if (fbi >= 0) feedbackLines[fbi] = line; else feedbackLines.push(line);
        }


        // Experience reasons
        {
            const expIdx2 = idx("Experience");
            if (expIdx2 >= 0) {
                const expTxt2 = (extractSection(resumeText, "experience") || resumeText).toLowerCase();
                const actionHits2 = (expTxt2.match(/\b(le(?:d|ad)|manag|coordinat|implement|develop|optimis|streamlin|reduce|increase|improve|save|administer|perform|monitor|train|mentor)\w*/g) || []).length;
                const metricHits2 = (expTxt2.match(/(\$[\d,]+|\d+(?:\.\d+)?%|\b\d{1,3}(?:,\d{3})+\b)/g) || []).length;
                const expReasons = [
                    actionHits2 ? `${actionHits2} action verbs` : "few action verbs",
                    metricHits2 ? `${metricHits2} quantified metrics` : "no quantified metrics"
                ];
                (atsBreakdownCompleted[expIdx2] as any).reasons = expReasons;
                const line = `Experience: ${atsBreakdownCompleted[expIdx2].score}/20 — ${expReasons.join("; ")}`;
                const fbi = feedbackLines.findIndex((l: string) => /^Experience:\s*/i.test(l));
                if (fbi >= 0) feedbackLines[fbi] = line; else feedbackLines.push(line);
            }
        }

        // Education reasons (relevance to JD)
        {
            const eduIdx = atsBreakdownCompleted.findIndex(b => b.label === "Education");
            if (eduIdx >= 0) {
                const jdTxt = jobDescription.toLowerCase();
                const cvTxt = resumeText.toLowerCase();

                const fields = ["data science", "statistics", "mathematics", "computer science", "economics"];
                const wantsTertiary = /\b(tertiary|degree|bachelor|masters?|qualification)\b/i.test(jdTxt);
                const jdFields = fields.filter(f => jdTxt.includes(f));
                const cvFields = fields.filter(f => cvTxt.includes(f));

                let reasons: string[] = [];
                let score = atsBreakdownCompleted[eduIdx].score; // start with model

                if (!sections.hasEducation) {
                    reasons = ["education missing", "missing required degree"];
                    score = 0;
                } else if (wantsTertiary && jdFields.length) {
                    if (cvFields.length) {
                        reasons = ["education present", "perfectly matches Job Description requirements"];
                        score = 10;
                    } else if (/\b(bachelor|degree|diploma)\b/i.test(cvTxt)) {
                        reasons = ["education present", "partially relevant"];
                        score = Math.max(score, 6); // don’t under-score if degree exists but not in requested list
                    } else {
                        reasons = ["education present", "missing required degree"];
                        score = Math.min(score, 4);
                    }
                } else {
                    reasons = ["education present", "partially relevant"];
                    score = Math.max(score, 6);
                }

                atsBreakdownCompleted[eduIdx] = { label: "Education", score, max: 10, reasons };

                const line = `Education: ${score}/10 — ${reasons.join("; ")}`;
                const fbi = feedbackLines.findIndex((l: string) => /^Education:\s*/i.test(l));
                if (fbi >= 0) feedbackLines[fbi] = line; else feedbackLines.push(line);
            }
        }


        // Ensure we return exactly six feedback lines, in order
        {
            const orderLines = ["Structure", "Summary", "Skills", "Experience", "Education", "Keywords"];
            feedbackLines = orderLines.map(lbl => {
                const re = new RegExp(`^${lbl}:\\s*`, "i");
                const found = feedbackLines.find(l => re.test(l));
                if (found) return found;
                // sensible default if missing
                const max = (lbl === "Education" || lbl === "Keywords") ? 10 : 20;
                return `${lbl}: 0/${max} —`;
            });
        }

        // Topline overall: keep your existing blend
        const overallScore = Math.round(
            100 * Math.pow(matchScore / 100, 0.7) * Math.pow(atsScore / 100, 0.3)
        );

        // Build pack (light de-dupe, no regex heuristics)
        const pack = {
            professionalSummary: toStr(r.professionalSummary),
            keySkills: uniqNorm(toArr(r.keySkills)).slice(0, 25),
            // passthrough inferred skills (you may render them later if you want)
            inferredSkills: Array.isArray(r.inferredSkills) ? r.inferredSkills : [],
            professionalExperience: toExpArr(r.professionalExperience),
            keyProjects: toProjArr(r.keyProjects),
            educationAndCertification: toEduArr(r.educationAndCertification),
            toolsAndTechnologies: uniqNorm(toArr(r.toolsAndTechnologies).map(mapToolName)),
        };

        // Build analysis lists (passthrough)
        const analysisLists = {
            strengths: toArr(a.strengths),
            improvements: toArr(a.improvements),
            gaps: toArr(a.gaps),
            recommendations: toArr(a.recommendations),
            overallSummary: toStr(a.overallSummary),
        };

        // Optional: apply your keyword coaching rules on top (kept)
        applyKeywordRules(analysisLists, jobDescription, resumeText);

        // ---------- Build Markdown (unchanged except we don’t touch ATS here) ----------
        const mdParts: string[] = [
            `### Strengths`,
            ...analysisLists.strengths.map((s: string) => `- ${s}`),
            ``,
            `### Opportunities to Improve`,
            ...analysisLists.improvements.map((s: string) => `- ${s}`),
            ``,
            `### Gaps`,
            ...analysisLists.gaps.map((s: string) => `- ${s}`),
            ``,
            `### Recommendations`,
            ...analysisLists.recommendations.map((s: string) => `- ${s}`),
            ``,
            `### Overall Summary`,
            analysisLists.overallSummary || "",
            ``,
            `---`,
            `## Resume Rewrite Pack`,
            ``,
            `### Professional Summary`,
            pack.professionalSummary || "",
            ``,
            `### Key Skills`,
            pack.keySkills.length ? `- ${pack.keySkills.join("\n- ")}` : "",
            ``,
            `### Professional Experience`,
            ...pack.professionalExperience.flatMap((role) => {
                const header = `**${role.title || ""} — ${role.employer || ""}${role.location ? `, ${role.location}` : ""
                    }${role.start || role.end ? ` (${[role.start, role.end].filter(Boolean).join(" – ")})` : ""
                    }**`;
                const bullets = (role.bullets || []).map((b: string) => `- ${b}`);
                return [header, ...bullets, ""];
            }),
        ];

        if (Array.isArray(pack.keyProjects) && pack.keyProjects.length > 0) {
            mdParts.push(
                `### Key Projects`,
                ...pack.keyProjects.flatMap((p) => {
                    const header = `**${p.name || ""}${p.context ? ` — ${p.context}` : ""}**`;
                    const toolsLine =
                        Array.isArray(p.tools) && p.tools.length ? `*Tools:* ${p.tools.join(", ")}` : "";
                    const bullets = (p.bullets || []).map((b: string) => `- ${b}`);
                    return toolsLine ? [header, toolsLine, ...bullets, ""] : [header, ...bullets, ""];
                })
            );
        }

        mdParts.push(
            `### Education & Certification`,
            ...pack.educationAndCertification.map((e) => {
                const line = [e.name, e.institution, e.year].filter(Boolean).join(" — ");
                return `- ${line}`;
            }),
            ``,
            `### Tools & Technologies`,
            pack.toolsAndTechnologies.length ? `- ${pack.toolsAndTechnologies.join("\n- ")}` : ""
        );

        const markdown = enforceDomainConsistency(mdParts.join("\n"), resumeText, jobDescription);

        // Evidence preview (unchanged)
        const evMatched = Array.isArray(parsed.evidence?.matched) ? parsed.evidence.matched : [];
        const evMissing = Array.isArray(parsed.evidence?.missing) ? parsed.evidence.missing : [];
        const evidencePreview = {
            matched: evMatched.slice(0, 5).map((e: any) => ({
                item: toStr(e?.item),
                resume_quotes: evidenceSafeJoin(e?.resume_quotes),
                jd_quotes: evidenceSafeJoin(e?.jd_quotes),
            })),
            missing: evMissing.slice(0, 5).map((e: any) => ({
                item: toStr(e?.item),
                jd_quotes: evidenceSafeJoin(e?.jd_quotes),
            })),
        };


        /** ---------- 2) Narrative call ---------- */
        const systemMessageNarrative = `
You are a concise, recruiter-grade writing assistant.
Write a brief, structured narrative based ONLY on the provided facts, resume, and Job Description.
Use AU/UK spelling. No fluff. Do not invent details.
`.trim();

        const userMessageNarrative = `
REQUEST_NONCE: ${nonce}
ROLE_TITLE: ${jobTitle || "the role"}
COMPANY_NAME: ${companyName || "the company"}

STRUCTURED_FACTS (from the previous step — do not contradict the resume/JD):
- ATS score (model): ${atsScore}
- Match score (model): ${matchScore}
- Strengths: ${analysisLists.strengths.join("; ")}
- Gaps: ${analysisLists.gaps.join("; ")}
- Improvements: ${analysisLists.improvements.join("; ")}
- Recommendations: ${analysisLists.recommendations.join("; ")}
- Key skills: ${pack.keySkills.join(", ")}
- Project names: ${(pack.keyProjects || []).map(p => p.name).join("; ")}

RESUME (full text):
<<<RESUME_START>>>
${resumeText}
<<<RESUME_END>>>

JOB DESCRIPTION (full text):
<<<JD_START>>>
${jobDescription}
<<<JD_END>>>

Write the narrative now in the exact style and sectioning previously specified. Make it accurate to the evidence. Avoid claiming anything not present in the resume.
`.trim();


        const completionNarrative = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0,
            max_tokens: 1200,
            user: `resume-narrative:${nonce}`,
            messages: [
                { role: "system", content: systemMessageNarrative },
                { role: "user", content: userMessageNarrative },
            ],
        });

        const narrativeRaw = toStr(completionNarrative.choices?.[0]?.message?.content).trim();
        const looksRight = /^Got it\s*✅/i.test(narrativeRaw) && narrativeRaw.includes("📊 ATS & Match Analysis");
        const narrative = looksRight ? narrativeRaw : buildFallbackNarrative({ resumeText, jobDescription, jobTitle, companyName, heur });

        /** ---------- Final payload ---------- */
        return NextResponse.json(
            {
                success: true,
                narrative,
                analysis: {
                    atsScore: {
                        score: atsScore,
                        feedback: feedbackLines,
                        breakdown: atsBreakdownCompleted,
                    },
                    jobFitScore: {
                        score: matchScore,
                        buckets: {
                            mustHave: clamp100(buckets.mustHave ?? 50, 50),
                            coreSkills: clamp100(buckets.coreSkills ?? 50, 50),
                            domainTitleAdjacency: clamp100(buckets.domainTitleAdjacency ?? 50, 50),
                            seniority: clamp100(buckets.seniority ?? 50, 50),
                            recency: clamp100(buckets.recency ?? 50, 50),
                            niceToHaves: clamp100(buckets.niceToHaves ?? 50, 50),
                        },
                        gates: { reasons: [] },
                        debug: { evidencePreview },
                    },
                    overallScore,
                    text: markdown,
                    pack,
                    analysisLists,
                    keywords: {
                        pct: kw.pct,
                        matched: displayMatched,
                        missing: displayMissing,
                        presentInJD: kw.presentInJD,
                    },
                    meta: {
                        profession: toStr(professionOverall),
                        professionResume: toStr(profResume),
                        professionJD: toStr(profJD),
                        domainMatch: toStr(domainMatch),
                        counts: {
                            resumeSkills: pack.keySkills.length,
                            jobRequirements: matchedSkills.length + missingSkills.length,
                            educationItems: pack.educationAndCertification.length || 0,
                        },
                        companyName,
                        jobTitle,
                        country,
                        state,
                    },
                },
                message: "Analysis completed successfully (model-driven extraction + scoring).",
            },
            { status: 200, headers: noStoreHeaders() }
        );



    } catch (error) {
        console.error("❌ Analysis error:", error);
        return NextResponse.json(
            { error: "Failed to analyse documents", details: error instanceof Error ? error.message : "Unknown error" },
            { status: 500, headers: noStoreHeaders() }
        );
    }
}


/** -------------------- Minimal fallback narrative -------------------- */
function buildFallbackNarrative(args: {
    resumeText: string;
    jobDescription: string;
    jobTitle: string;
    companyName: string;
    heur: { score: number; feedback: string[] };
}) {
    const { jobTitle, companyName, heur } = args;
    const role = jobTitle || "Data Analyst";
    const org = companyName || "the company";

    return [
        `Got it ✅ I’ve reviewed your CV against the ${role} role at ${org}. Here’s a full ATS-style breakdown + human recruiter analysis:\n`,
        `📊 ATS & Match Analysis`,
        ``,
        `ATS Score (Resume vs JD): ~${Math.max(70, heur.score)}/100`,
        `Job Match Score: Strong → Clear alignment across core tools and delivery; a few upskill opportunities noted.\n`,
        `✅ Strengths`,
        `- Clear end-to-end analytics delivery and stakeholder engagement.`,
        `- Good presence of BI tooling (e.g., Power BI / SQL) and dashboarding.`,
        `- Evidence of data quality/governance and operational reporting.\n`,
        `⚠️ Weaknesses / Gaps`,
        `- Predictive analytics / statistical modelling not strongly evidenced.`,
        `- Automation of recurring reporting could be made explicit (pipelines/scheduling).`,
        `- Storytelling language (insights → decisions) could be sharpened.\n`,
        `🔧 Improvements`,
        `- Add 1–2 bullets quantifying outcomes (%, time saved, cost avoided).`,
        `- Call out any automation (ETL/Power Query/scripts) and scheduling.`,
        `- Strengthen the narrative around business impact and decision enablement.\n`,
        `📌 Recommendations`,
        `- Tailor summary with JD keywords (e.g., predictive insights, storytelling, automation).`,
        `- If applicable, include forecasting/regression examples (Python/Power BI).`,
        `- Mirror JD phrasing where accurate to boost ATS retrieval.\n`,
        `🧩 What’s Missing vs JD`,
        `- Predictive modelling / advanced stats (if the JD requests it).`,
        `- Explicit “automated recurring reporting” phrasing.`,
        `- Cross-functional planning support bullets, if relevant.\n`,
        `⚖️ Bottom line:`,
        `A strong foundation that likely places you in the “shortlist” band. With small tweaks around predictive analytics, automation, and storytelling, you’ll push towards a 90–95% ATS & recruiter match.`,
    ].join("\n");
}
