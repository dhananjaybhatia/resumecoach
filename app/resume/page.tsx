"use client";

import React, { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, FileText, X } from "lucide-react";
import Image from "next/image";
import { toast } from "@/lib/toast";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { Country, State } from "country-state-city";

const isFile = (v: unknown): v is File =>
  typeof File !== "undefined" && v instanceof File;

const resumeFormSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  jobTitle: z.string().min(1, "Job title is required"),
  country: z.string().min(1, "Country is required"),
  state: z.string().min(1, "State/Province is required"),
  jobDescription: z
    .string()
    .min(10, "Job description must be at least 10 characters"),
  resume: z
    .any()
    .refine((file) => !file || isFile(file), "Please upload a file")
    .refine(
      (file) => !file || file.size <= 5 * 1024 * 1024,
      "File size must be less than 5MB"
    )
    .refine(
      (file) => {
        if (!file) return true;
        const allowed = [
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "text/plain",
          "application/pdf",
        ];
        return (
          allowed.includes(file.type) || /\.(docx?|txt|pdf)$/i.test(file.name)
        );
      },
      { message: "Please upload a DOC, DOCX, TXT, or PDF file" }
    )
    .optional(),
});

type ResumeFormData = z.infer<typeof resumeFormSchema>;

const ResumePage = () => {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [statusTimers, setStatusTimers] = useState<NodeJS.Timeout[]>([]); // ← ADD THIS
  const [selectedCountry, setSelectedCountry] = useState<string>("");
  const [availableStates, setAvailableStates] = useState<
    { name: string; countryCode: string; isoCode: string }[]
  >([]);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
  } = useForm<ResumeFormData>({
    resolver: zodResolver(resumeFormSchema),
  });

  // Handle country selection and update states
  const handleCountryChange = (countryName: string) => {
    setSelectedCountry(countryName);
    setValue("country", countryName);
    setValue("state", ""); // Reset state when country changes

    // Find the country code
    const country = Country.getAllCountries().find(
      (c) => c.name === countryName
    );
    if (country) {
      const states = State.getStatesOfCountry(country.isoCode);
      setAvailableStates(states || []);
    } else {
      setAvailableStates([]);
    }
  };

  // ADD THIS HELPER FUNCTION
  const getStatusSubtitle = (status: string) => {
    if (status.includes("Uploading")) return "Almost there...";
    if (status.includes("Preparing")) return "Organising your data...";
    if (status.includes("analysis")) return "AI is working its magic...";
    if (status.includes("Finalizing")) return "Almost ready!";
    return "This may take a few seconds";
  };

  // ADD CLEANUP EFFECT
  useEffect(() => {
    return () => {
      // Clear all timers when component unmounts
      statusTimers.forEach((timer) => clearTimeout(timer));
    };
  }, [statusTimers]);

  const onSubmit = async (data: ResumeFormData) => {
    try {
      if (!uploadedFile) {
        toast.error("Please upload a resume file before submitting.");
        return;
      }

      setStatusText("Uploading your file..."); // Initial status

      // Set up status timer - updates every 15 seconds
      const statusStages = [
        "Uploading your file...",
        "Preparing data for analysis...",
        "AI analysis in progress...",
        "Finalising results...",
      ];

      // Create new timers
      const newStatusTimers = statusStages.map((stage, index) => {
        return setTimeout(() => {
          setStatusText(stage);
        }, (index + 1) * 8000); // 15s, 30s, 45s, 60s
      });

      setStatusTimers(newStatusTimers); // Store timers for cleanup

      const formData = new FormData();
      formData.append("resume", uploadedFile, uploadedFile.name);
      formData.append("companyName", data.companyName);
      formData.append("jobTitle", data.jobTitle);
      formData.append("country", data.country);
      formData.append("state", data.state);
      formData.append("jobDescription", data.jobDescription);

      const response = await fetch("/api/analyze-resume", {
        method: "POST",
        body: formData,
        cache: "no-store",
      });

      if (!response.ok) {
        try {
          const errorResult = await response.json();
          console.log("❌ API Error Response:", errorResult);

          // 🆕 HANDLE RATE LIMIT - REDIRECT TO SIGN-IN WITH MESSAGE
          if (response.status === 429) {
            if (!errorResult.isAuthenticated) {
              // Anonymous user hit limit - redirect to sign up with message
              toast.error("You've used your free scan. Sign up for more!");
              router.push("/sign-in?from=rate-limit");
            } else {
              // Authenticated user hit limit - offer upgrade
              toast.error("Daily limit reached. Come back tomorrow!");
            }
            return;
          }

          // Handle specific PDF-related errors
          if (response.status === 400) {
            if (errorResult.error === "Failed to extract text from file") {
              toast.error(
                "Unable to read the PDF file. Please try a different format or ensure the PDF is not password protected."
              );
              return;
            } else if (
              errorResult.validationErrors ||
              errorResult.error === "This doesn't appear to be a resume"
            ) {
              toast.error("Please upload a valid resume.");
              return;
            }
          }

          // Generic error for other cases
          toast.error(
            errorResult.error || "Failed to analyse resume. Please try again."
          );
          return;
        } catch {
          // Fallback for non-JSON responses
          toast.error("Server error occurred. Please try again.");
          return;
        } finally {
          setStatusText("");
          // Clear all timers when done
          statusTimers.forEach((timer) => clearTimeout(timer));
          setStatusTimers([]);
        }
      }

      const result = await response.json();
      console.log("✅ Full API Response:", result);

      if (result.success) {
        // Check if the analysis is already structured or needs parsing
        if (typeof result.analysis === "string") {
          // Backend returned text analysis - parse it
          const parsedAnalysis = parseAnalysisText(result.analysis);

          // Extract scores from the parsed analysis
          const atsScoreMatch = result.analysis.match(/ATS Score[^\d]*(\d+)/i);
          const matchScoreMatch = result.analysis.match(
            /Match Score[^\d]*(\d+)/i
          );

          const atsScore = atsScoreMatch ? parseInt(atsScoreMatch[1]) : 0;
          const matchScore = matchScoreMatch ? parseInt(matchScoreMatch[1]) : 0;

          console.log("📊 Parsed Analysis:", {
            atsScore,
            matchScore,
            analysis: parsedAnalysis,
          });

          // Store the parsed data
          localStorage.setItem(
            "resumeAnalysis",
            JSON.stringify({
              ...result,
              analysis: parsedAnalysis,
              atsScore,
              matchScore,
            })
          );
        } else {
          // Backend returned structured analysis
          console.log("📊 Structured Analysis:", result.analysis);
          localStorage.setItem("resumeAnalysis", JSON.stringify(result));
        }

        // Store resume info
        const resumeInfo = {
          name: uploadedFile.name,
          type: uploadedFile.type,
          size: uploadedFile.size,
        };
        localStorage.setItem("resumeInfo", JSON.stringify(resumeInfo));

        // Show success message with scores
        const displayAtsScore =
          result.analysis?.atsScore?.score || result.atsScore || 0;
        const displayMatchScore =
          result.analysis?.jobFitScore?.score || result.matchScore || 0;

        toast.success(
          `Analysis Complete! ATS Score: ${displayAtsScore}/100 | Match Score: ${displayMatchScore}/100`
        );

        router.push("/results");
      } else {
        toast.error(result.error || "Analysis failed");
        return;
      }
    } catch (error) {
      console.error("Error submitting form:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Error analysing resume. Please try again."
      );
    } finally {
      setStatusText("");
    }
  };

  const parseAnalysisText = (analysisText: string) => {
    const sections: Record<string, string> = {};

    // Helper function to clean markdown formatting
    const cleanMarkdown = (content: string) => {
      return content
        .replace(/^\d+\.\s+/gm, "") // Remove numbered lists: "1. " → ""
        .replace(/\*\*(.*?)\*\*/g, "$1") // Remove bold: **text** → text
        .replace(/\*(.*?)\*/g, "$1") // Remove italic: *text* → text
        .replace(/\n\s*\n/g, "\n\n") // Clean up extra newlines
        .trim();
    };

    // Extract sections using regex
    const strengthMatch = analysisText.match(
      /### Strengths\n\n([\s\S]*?)(?=###|$)/i
    );
    const weaknessesMatch = analysisText.match(
      /### Weaknesses\n\n([\s\S]*?)(?=###|$)/i
    );
    const gapsMatch = analysisText.match(/### Gaps\n\n([\s\S]*?)(?=###|$)/i);
    const recommendationsMatch = analysisText.match(
      /### Recommendations\n\n([\s\S]*?)(?=###|$)/i
    );
    const summaryMatch = analysisText.match(
      /### Overall Summary\n\n([\s\S]*?)(?=$)/i
    );

    // Clean and assign sections
    if (strengthMatch) sections.strengths = cleanMarkdown(strengthMatch[1]);
    if (weaknessesMatch)
      sections.weaknesses = cleanMarkdown(weaknessesMatch[1]);
    if (gapsMatch) sections.gaps = cleanMarkdown(gapsMatch[1]);
    if (recommendationsMatch)
      sections.recommendations = cleanMarkdown(recommendationsMatch[1]);
    if (summaryMatch) sections.summary = cleanMarkdown(summaryMatch[1]);

    return sections;
  };

  const handleFileUpload = (file: File) => {
    const allowedTypes = [
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "application/pdf",
    ];

    if (
      !allowedTypes.includes(file.type) &&
      !file.name.match(/\.(docx?|txt|pdf)$/i)
    ) {
      toast.error("Please upload a DOC, DOCX, TXT, or PDF file");
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error("File size must be less than 5MB");
      return;
    }

    setUploadedFile(file);
    setValue("resume", file);
    toast.success("File uploaded successfully!");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const removeFile = () => {
    setUploadedFile(null);
    setValue("resume", undefined);
  };

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-2">
            Smart feedback. Real interviews.
          </h1>
          <p className="text-xl md:text-2xl text-gray-600 max-w-3xl mx-auto">
            Drop your resume for ATS score and improvement tips
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8">
          <form
            ref={formRef}
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-8"
            encType="multipart/form-data"
            id="resume-form"
          >
            <div className="space-y-2">
              <Label
                htmlFor="companyName"
                className="text-lg font-semibold text-gray-900"
              >
                Company Name
              </Label>
              <Input
                id="companyName"
                placeholder="Enter company name"
                {...register("companyName")}
                className="h-12 text-base"
              />
              {errors.companyName && (
                <p className="text-red-500 text-sm">
                  {errors.companyName.message}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="space-y-2 md:col-span-2">
                <Label
                  htmlFor="jobTitle"
                  className="text-lg font-semibold text-gray-900"
                >
                  Job Title
                </Label>
                <Input
                  id="jobTitle"
                  placeholder="Enter job title"
                  {...register("jobTitle")}
                  className="h-[48px] text-base"
                />
                {errors.jobTitle && (
                  <p className="text-red-500 text-sm">
                    {errors.jobTitle.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="country"
                  className="text-lg font-semibold text-gray-900"
                >
                  Country
                </Label>
                <Select onValueChange={handleCountryChange}>
                  <SelectTrigger className="text-base w-full py-5.5">
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent>
                    {Country.getAllCountries().map((country) => (
                      <SelectItem key={country.isoCode} value={country.name}>
                        {country.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.country && (
                  <p className="text-red-500 text-sm">
                    {errors.country.message || "Country is required"}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="state"
                  className="text-lg font-semibold text-gray-900"
                >
                  State/Province
                </Label>
                <Select
                  onValueChange={(value) => setValue("state", value)}
                  disabled={!selectedCountry}
                >
                  <SelectTrigger className="text-base w-full py-5.5">
                    <SelectValue
                      placeholder={
                        selectedCountry
                          ? "Select state/province"
                          : "Select state"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {availableStates.map((state, index) => (
                      <SelectItem
                        key={`${state.name}-${state.countryCode}-${index}`}
                        value={state.name}
                      >
                        {state.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.state && (
                  <p className="text-red-500 text-sm">
                    {errors.state.message || "State/Province is required"}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="jobDescription"
                className="text-lg font-semibold text-gray-900"
              >
                Job Description
              </Label>
              <Textarea
                id="jobDescription"
                placeholder="Paste the job description here..."
                {...register("jobDescription")}
                className="min-h-32 text-base resize-vertical"
              />
              {errors.jobDescription && (
                <p className="text-red-500 text-sm">
                  {errors.jobDescription.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-lg font-semibold text-gray-900">
                Resume Upload
              </Label>
              {errors.resume && (
                <p className="text-red-500 text-sm">
                  {String(
                    errors.resume?.message || "Please upload a resume file"
                  )}
                </p>
              )}

              {!uploadedFile ? (
                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    isDragOver
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-300 hover:border-gray-400"
                  }`}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                >
                  <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <p className="text-lg font-medium text-gray-900 mb-2">
                    Drop your resume here or click to browse
                  </p>
                  <p className="text-gray-500 mb-4">
                    Supports DOC, DOCX, TXT, and PDF files (max 5MB)
                  </p>
                  <input
                    type="file"
                    accept=".doc,.docx,.txt,.pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                    }}
                    className="hidden"
                    id="resume-upload"
                  />

                  <label
                    htmlFor="resume-upload"
                    className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-lg cursor-pointer transition-all duration-300 transform hover:scale-105"
                  >
                    Choose File
                  </label>
                </div>
              ) : (
                <div className="border-2 border-green-200 bg-green-50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {uploadedFile.type.includes("pdf") ? (
                        <Image
                          src="/images/pdf.png"
                          alt="PDF File"
                          width={32}
                          height={32}
                          className="h-8 w-8"
                        />
                      ) : uploadedFile.type.includes("document") ? (
                        <Image
                          src="/images/doc.svg"
                          alt="Document File"
                          width={32}
                          height={32}
                          className="h-8 w-8"
                        />
                      ) : (
                        <FileText className="h-8 w-8 text-green-600" />
                      )}
                      <div>
                        <p className="font-medium text-green-900">
                          {uploadedFile.name}
                        </p>
                        <p className="text-sm text-green-700">
                          {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={removeFile}
                      className="p-1 hover:bg-green-200 rounded-full transition-colors"
                    >
                      <X className="h-5 w-5 text-green-600" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-full transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {isSubmitting ? "Analysing..." : "Analyse Resume"}
              </Button>
            </div>
          </form>
        </div>
      </div>

      <AnimatePresence>
        {isSubmitting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-50 bg-gradient-to-br from-blue-50/90 to-purple-50/90 backdrop-blur-md"
          >
            <div className="h-full flex flex-col items-center justify-center px-4">
              {/* Status Text with Multi-stage Progress */}
              <motion.div
                key={statusText}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.5 }}
                className="text-center"
              >
                <h2 className="text-2xl md:text-3xl font-semibold text-gray-800 mb-2">
                  {statusText || "Starting analysis..."}
                </h2>
                <p className="text-sm md:text-base text-gray-600">
                  {getStatusSubtitle(statusText)}
                </p>
              </motion.div>

              {/* Optional: Progress dots */}
              <motion.div className="flex space-x-2 mt-6">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-2 h-2 bg-orange-500 rounded-full"
                    animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: i * 0.2,
                    }}
                  />
                ))}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ResumePage;
