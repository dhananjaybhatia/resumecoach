interface ScanResultsProps {
  analysis: any; // You might want to type this more specifically
  plan: string;
  remainingToday?: number;
}

const ScanResults = ({ analysis, plan, remainingToday }: ScanResultsProps) => {
  return (
    <div>
      {/* Analysis content */}
      {/* You can pass the analysis data to child components here */}

      {/* Quota status footer */}
      <div className="mt-8 p-4 bg-gray-50 rounded-lg">
        <h3 className="font-semibold">Scan Usage</h3>
        <p>
          Plan: <strong>{plan}</strong>
        </p>
        {remainingToday !== undefined && (
          <p>
            Scans remaining today: <strong>{remainingToday}</strong>
          </p>
        )}
        {plan === "free" && remainingToday === 0 && (
          <p className="text-orange-600">
            Daily limit reached. Come back tomorrow!
          </p>
        )}
      </div>
    </div>
  );
};

export default ScanResults;
