import { Page, Text, View, Document, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 30, fontSize: 12, fontFamily: "Helvetica" },
  header: { fontSize: 18, marginBottom: 20, fontWeight: "bold" },
  section: { marginBottom: 15 },
  sectionTitle: { fontSize: 14, fontWeight: "bold", marginBottom: 8 },
  score: { fontSize: 16, fontWeight: "bold", color: "#1890ff" },
  listItem: { marginBottom: 4 },
});

interface AnalysisData {
  overallScore?: number;
  atsScore?: {
    score: number;
    feedback?: string[];
    breakdown?: Array<{ label: string; score: number; max: number }>;
  };
  jobFitScore?: {
    score: number;
    buckets?: Record<string, number>;
    debug?: {
      evidencePreview?: {
        matched?: Array<{ item: string }>;
        missing?: Array<{ item: string }>;
      };
    };
  };
  analysisLists?: {
    strengths?: string[];
    improvements?: string[];
    gaps?: string[];
    recommendations?: string[];
    overallSummary?: string;
  };
  meta?: {
    jobTitle?: string;
    companyName?: string;
    state?: string;
    country?: string;
  };
}

const ResumeAnalysisPDF = ({
  analysisData,
}: {
  analysisData: AnalysisData;
}) => {
  // Safe access with proper structure from your API
  const meta = analysisData?.meta || {
    jobTitle: "",
    companyName: "",
    state: "",
    country: "",
  };
  const atsScore = analysisData?.atsScore || {
    score: 0,
    feedback: [],
    breakdown: [],
  };
  const jobFitScore = analysisData?.jobFitScore || {
    score: 0,
    buckets: {},
    debug: {
      evidencePreview: {
        matched: [],
        missing: [],
      },
    },
  };
  const analysisLists = analysisData?.analysisLists || {
    strengths: [],
    improvements: [],
    gaps: [],
    recommendations: [],
    overallSummary: "",
  };

  return (
    <Document>
      <Page style={styles.page}>
        {/* Header */}
        <Text style={styles.header}>RESUME ANALYSIS REPORT</Text>
        <Text>Generated: {new Date().toLocaleDateString()}</Text>
        <Text>Position: {meta.jobTitle || "N/A"}</Text>
        <Text>Company: {meta.companyName || "N/A"}</Text>
        <Text>
          Location: {meta.state ? `${meta.state}, ${meta.country}` : "N/A"}
        </Text>

        {/* Overall Score */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>OVERALL SCORE</Text>
          <Text style={styles.score}>{analysisData.overallScore || 0}/100</Text>
        </View>

        {/* ATS Score Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            ATS SCORE: {atsScore.score || 0}/100
          </Text>
          {atsScore.feedback?.map((feedback: string, index: number) => (
            <Text key={index} style={styles.listItem}>
              • {feedback}
            </Text>
          ))}
        </View>

        {/* Detailed ATS Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DETAILED ATS BREAKDOWN</Text>
          {atsScore.breakdown?.map((item, index) => (
            <View key={index} style={{ marginBottom: 8 }}>
              <Text style={styles.listItem}>
                {item.label}: {item.score}/{item.max}
              </Text>
            </View>
          )) || <Text>No breakdown data available</Text>}
        </View>

        {/* Job Fit Score */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            JOB FIT SCORE: {jobFitScore.score || 0}/100
          </Text>
          {jobFitScore.buckets &&
            Object.entries(jobFitScore.buckets).map(([key, value]) => (
              <Text key={key} style={styles.listItem}>
                •{" "}
                {key
                  .replace(/([A-Z])/g, " $1")
                  .replace(/^./, (str: string) => str.toUpperCase())}
                : {value}/100
              </Text>
            ))}
        </View>

        {/* Strengths */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>STRENGTHS</Text>
          {analysisLists.strengths?.map((item: string, index: number) => (
            <Text key={index} style={styles.listItem}>
              • {item}
            </Text>
          )) || <Text>No strengths data available</Text>}
        </View>

        {/* Improvements */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>OPPORTUNITIES TO IMPROVE</Text>
          {analysisLists.improvements?.map((item: string, index: number) => (
            <Text key={index} style={styles.listItem}>
              • {item}
            </Text>
          )) || <Text>No improvement suggestions available</Text>}
        </View>

        {/* Gaps */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>GAPS</Text>
          {analysisLists.gaps?.map((item: string, index: number) => (
            <Text key={index} style={styles.listItem}>
              • {item}
            </Text>
          )) || <Text>No gaps identified</Text>}
        </View>

        {/* Recommendations */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>RECOMMENDATIONS</Text>
          {analysisLists.recommendations?.map((item: string, index: number) => (
            <Text key={index} style={styles.listItem}>
              • {item}
            </Text>
          )) || <Text>No recommendations available</Text>}
        </View>

        {/* Full Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SUMMARY</Text>
          <Text>{analysisLists.overallSummary || "No summary available"}</Text>
        </View>

        {/* Matched Qualifications */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MATCHED QUALIFICATIONS</Text>
          {jobFitScore.debug?.evidencePreview?.matched &&
          jobFitScore.debug.evidencePreview.matched.length > 0 ? (
            jobFitScore.debug.evidencePreview.matched.map(
              (item: { item: string }, index: number) => (
                <Text key={index} style={styles.listItem}>
                  • {item.item || "Unknown qualification"}
                </Text>
              )
            )
          ) : (
            <Text>No matched qualifications data available</Text>
          )}
        </View>

        {/* Missing Qualifications */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MISSING QUALIFICATIONS</Text>
          {jobFitScore.debug?.evidencePreview?.missing &&
          jobFitScore.debug.evidencePreview.missing.length > 0 ? (
            jobFitScore.debug.evidencePreview.missing.map(
              (item: { item: string }, index: number) => (
                <Text key={index} style={styles.listItem}>
                  • {item.item || "Unknown qualification"}
                </Text>
              )
            )
          ) : (
            <Text>No missing qualifications data available</Text>
          )}
        </View>
      </Page>
    </Document>
  );
};

export default ResumeAnalysisPDF;
