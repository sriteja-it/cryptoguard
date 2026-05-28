import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Shield, Key, AlertTriangle, CheckCircle2, Clock3, ArrowRight, Sparkles, History } from "lucide-react";
import BentoCard from "../components/BentoCard";
import SkeletonCard from "../components/SkeletonCard";
import CircularGauge from "../components/CircularGauge";
import { isValidUrl, formatUrlForApi } from "../../utils/validation";
import { config } from "../../utils/config";
import { getFetchErrorMessage, readJson, resolveApiError } from "../../utils/api";
import ScanHistoryList from "../components/ScanHistoryList";
import { ScanItem } from "../types";

type DashboardState = "empty" | "scanning" | "result" | "error";
type ErrorType = "invalid_url" | null;

type AuditError = {
  error?: string;
  details?: string;
  message?: string;
};

const QUICK_POINTS = [
  "Checks TLS and certificate data for quantum-era exposure",
  "Stores every audit in MongoDB so history survives key changes",
  "Shows risk, reasons, and migration guidance in plain language",
];

export default function Dashboard() {
  const [state, setState] = useState<DashboardState>("empty");
  const [url, setUrl] = useState("");
  const [errorType, setErrorType] = useState<ErrorType>(null);
  const [result, setResult] = useState<any | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [recentScans, setRecentScans] = useState<ScanItem[]>([]);
  const [historyError, setHistoryError] = useState<string>("");

  const formatAuditError = (payload: AuditError & { retryAfterSeconds?: number } | null, status: number) => {
    const errorCode = payload?.error || "";

    switch (errorCode) {
      case "missing_authorization":
        return "No API key is loaded yet. Open API Settings and generate a key first.";
      case "invalid_api_key":
        return "The saved API key is invalid. Generate a fresh key in API Settings.";
      case "api_key_expired":
        return "The current API key has expired. Generate or revive a key in API Settings.";
      case "quota_exhausted":
        return "This API key has reached its quota. Set the limit to 5 or upgrade the key.";
      case "rate_limited":
        return `Too many requests. Try again in ${payload?.retryAfterSeconds ?? 60} seconds.`;
      case "ssl_scrape_failed":
        return payload?.details || "TLS certificate scraping failed for this host.";
      case "invalid_scraper_output":
        return "The certificate scraper returned invalid data.";
      default:
        return resolveApiError(payload, status >= 500 ? "The audit backend returned an error." : "Unable to contact the audit backend.");
    }
  };

  const loadRecentScans = async () => {
    try {
      const apiUrl = `${config.apiBaseUrl.replace(/\/+$/, "")}/api/scans?limit=5`;
      const resp = await fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
        },
      });

      if (!resp.ok) {
        setHistoryError(await readJson<{ error?: string; details?: string }>(resp).then((payload) => resolveApiError(payload, "Unable to load recent scans.")));
        return;
      }

      const data = await resp.json();
      setRecentScans(Array.isArray(data?.scans) ? data.scans : []);
      setHistoryError("");
    } catch (error) {
      setRecentScans([]);
      setHistoryError(getFetchErrorMessage(error, "Unable to load recent scans."));
    }
  };

  useEffect(() => {
    loadRecentScans();
  }, []);

  const handleStartAudit = async () => {
    if (!config.apiKey) {
      setErrorMessage("No API key is loaded yet. Generate one in API Settings first.");
      setState("error");
      return;
    }

    if (!url || !isValidUrl(url)) {
      setErrorType("invalid_url");
      return;
    }

    setErrorType(null);
    setState("scanning");

    try {
      const apiUrl = `${config.apiBaseUrl.replace(/\/+$/, "")}/api/audit`;
      const resp = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({ url: formatUrlForApi(url) }),
      });

      if (!resp.ok) {
        const errorData = (await readJson<AuditError & { retryAfterSeconds?: number }>(resp)) || null;
        setErrorMessage(formatAuditError(errorData, resp.status));
        setState("error");
        return;
      }

      const data = await resp.json();
      setResult(data);
      setState("result");
      loadRecentScans();
    } catch (error) {
      setErrorMessage(getFetchErrorMessage(error, "Unable to contact the audit backend. Try again later."));
      setState("error");
    }
  };

  const handleReset = () => {
    setState("empty");
    setUrl("");
    setErrorType(null);
    setResult(null);
    setErrorMessage("");
  };

  const resultSummary = useMemo(() => {
    const risk = (result?.analysis?.riskLevel || "critical").toString().toUpperCase();
    const summary = result?.analysis?.summary || "Your current TLS setup is not quantum-safe yet.";
    return { risk, summary };
  }, [result]);

  const scores = useMemo(() => {
    // prefer backend-provided component scores when available
    const backendVuln = Number.isFinite(Number(result?.analysis?.vulnerabilityScore)) ? Number(result?.analysis?.vulnerabilityScore) : null;
    const backendQuantum = Number.isFinite(Number(result?.analysis?.quantumScore)) ? Number(result?.analysis?.quantumScore) : null;
    const backendClassical = Number.isFinite(Number(result?.analysis?.classicalScore)) ? Number(result?.analysis?.classicalScore) : null;

    const vulnerability = backendVuln !== null ? Math.max(0, Math.min(100, backendVuln)) : 95;

    // compute fallback quantum/classical if backend didn't provide them
    const fallbackQuantum = Math.round(Math.max(0, Math.min(100, 100 - vulnerability)));

    const ks = Number(result?.keySize || result?.analysis?.keySize || 0);
    const fallbackClassical = ks > 0 ? Math.round(Math.max(0, Math.min(100, (ks / 4096) * 100))) : ((result?.analysis?.riskLevel || '').toUpperCase() === 'CRITICAL' ? 60 : 85);

    const quantum = backendQuantum !== null ? backendQuantum : fallbackQuantum;
    const classical = backendClassical !== null ? backendClassical : fallbackClassical;

    return { vulnerability, quantum, classical };
  }, [result]);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <BentoCard className="overflow-hidden">
        <div className="relative grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#00A3FF]/20 bg-[#00A3FF]/10 text-[#00A3FF] text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              Quantum readiness scan
            </div>
            <div>
              <h1 className="text-2xl md:text-4xl font-bold text-white leading-tight">
                Scan a site, understand the risk, and keep every result in one place.
              </h1>
              <p className="mt-3 text-sm md:text-base text-gray-400 max-w-2xl">
                Enter a website URL and the dashboard will inspect TLS, summarize the exposure, and store the audit so the history stays visible even when keys change.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {QUICK_POINTS.map((point) => (
                <div key={point} className="rounded-xl border border-[#1e2532] bg-[#0B0E14] px-4 py-3 text-sm text-gray-300">
                  {point}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[#1e2532] bg-[#0B0E14] p-4 md:p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400">Current mode</p>
                <p className="text-sm font-semibold text-white">{state === "scanning" ? "Scanning" : state === "result" ? "Results ready" : state === "error" ? "Action needed" : "Ready to scan"}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-[#00A3FF]/10 border border-[#00A3FF]/20 flex items-center justify-center">
                <Clock3 className="w-5 h-5 text-[#00A3FF]" />
              </div>
            </div>

            <div className="space-y-2 text-sm text-gray-300">
              <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#00FF94]" /> Audit stored in MongoDB</div>
              <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#00FF94]" /> Scan history survives key rotation</div>
              <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#00FF94]" /> Results include certificate details</div>
            </div>
          </div>
        </div>
      </BentoCard>

      <BentoCard>
        <div className="space-y-4 md:space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg md:text-xl font-bold text-white">Start a scan</h2>
              <p className="text-sm text-gray-400">Use a valid public URL. The audit will pull TLS certificate data and score the exposure.</p>
            </div>
            <div className="hidden md:flex items-center gap-2 text-xs text-gray-400">
              <History className="w-4 h-4 text-[#00A3FF]" />
              Stored history loads below after each audit
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
            <div className="flex-1">
              <input
                type="text"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setErrorType(null);
                }}
                disabled={state === "scanning"}
                placeholder="https://example.com"
                className={`w-full bg-[#0B0E14] border rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none transition-colors disabled:opacity-50 text-sm md:text-base ${
                  errorType === "invalid_url"
                    ? "border-[#FF4D4D] focus:border-[#FF4D4D]"
                    : "border-[#1e2532] focus:border-[#00A3FF]"
                }`}
              />
              {errorType === "invalid_url" && (
                <motion.p initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="text-xs text-[#FF4D4D] mt-2 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Enter a valid public URL, like https://example.com
                </motion.p>
              )}
            </div>

            <motion.button
              onClick={state === "result" ? handleReset : handleStartAudit}
              disabled={state === "scanning" || (!url && state === "empty")}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-[#00FF94] to-[#00A3FF] text-[#0B0E14] font-bold rounded-lg hover:shadow-lg hover:shadow-[#00FF94]/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm md:text-base whitespace-nowrap"
            >
              {state === "result" ? "New Audit" : "Start Scan"}
              <ArrowRight className="w-4 h-4" />
            </motion.button>
          </div>
        </div>
      </BentoCard>

      {state === "empty" && (
        <div className="grid grid-cols-1 xl:grid-cols-[0.95fr_1.05fr] gap-4 md:gap-6">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-[#151921] border border-[#1e2532] rounded-xl p-8 md:p-10 text-left space-y-4">
            <Shield className="w-12 h-12 md:w-14 md:h-14 text-[#00A3FF]" />
            <div>
              <h3 className="text-lg md:text-xl font-bold text-white mb-2">What this scan page does</h3>
              <p className="text-sm md:text-base text-gray-400">
                It keeps the first screen focused: enter a URL, run the audit, then review the result cards and stored history without hunting through hidden controls.
              </p>
            </div>
            <div className="space-y-2 text-sm text-gray-300">
              <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#00FF94]" /> Clear input and one action button</div>
              <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#00FF94]" /> Error messages show the backend reason</div>
              <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#00FF94]" /> Recent scans stay visible below</div>
            </div>
          </motion.div>

          <ScanHistoryList
            scans={recentScans}
            title="Recent scans"
            subtitle="History"
            emptyMessage="No scans yet. Run an audit to populate the history."
            className="h-full"
            delay={0.15}
          />
          {historyError && (
            <div className="xl:col-span-2 rounded-lg border border-[#FFB84D]/20 bg-[#FFB84D]/10 px-4 py-3 text-sm text-[#FFB84D]">
              {historyError}
            </div>
          )}
        </div>
      )}

      {state === "scanning" && (
        <div className="space-y-4">
          <div className="text-center">
            <motion.div
              className="inline-flex items-center gap-3 bg-[#151921] border border-[#00A3FF]/30 rounded-lg px-4 md:px-6 py-3 md:py-4"
              animate={{ scale: [1, 1.02, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <motion.div
                className="w-3 h-3 bg-[#00A3FF] rounded-full"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <span className="text-[#00A3FF] font-medium text-sm md:text-base">
                Probing TLS handshake and certificate chain...
              </span>
            </motion.div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      )}

      {state === "result" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            <BentoCard delay={0}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-gray-400 text-xs md:text-sm mb-1">Detected algorithm</p>
                  <h3 className="text-xl md:text-2xl font-bold text-white">{result?.detectedAlgorithm || "RSA-2048"}</h3>
                </div>
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-[#FF4D4D]/20 flex items-center justify-center">
                  <Key className="w-5 h-5 md:w-6 md:h-6 text-[#FF4D4D]" />
                </div>
              </div>
              <p className="text-sm text-gray-300">
                {resultSummary.summary}
              </p>
            </BentoCard>

            <BentoCard delay={0.1}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-gray-400 text-xs md:text-sm mb-1">Key strength</p>
                  <h3 className="text-xl md:text-2xl font-bold text-white">{result?.keySize ? `${result.keySize}-bit` : "2048-bit"}</h3>
                </div>
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-[#00A3FF]/20 flex items-center justify-center">
                  <Shield className="w-5 h-5 md:w-6 md:h-6 text-[#00A3FF]" />
                </div>
              </div>
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Classical security</span>
                    <span className="text-[#00FF94]">{scores.classical}%</span>
                  </div>
                  <div className="h-2 bg-[#1e2532] rounded-full overflow-hidden">
                    <motion.div className="h-full bg-gradient-to-r from-[#00FF94] to-[#00A3FF]" initial={{ width: 0 }} animate={{ width: `${scores.classical}%` }} transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }} />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Quantum security</span>
                    <span className="text-[#FF4D4D]">{scores.quantum}%</span>
                  </div>
                  <div className="h-2 bg-[#1e2532] rounded-full overflow-hidden">
                    <motion.div className="h-full bg-[#FF4D4D]" initial={{ width: 0 }} animate={{ width: `${scores.quantum}%` }} transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }} />
                  </div>
                </div>
              </div>
            </BentoCard>

            <BentoCard delay={0.2} className="col-span-1 md:col-span-2">
              <div className="flex flex-col lg:flex-row items-start justify-between mb-6 gap-4">
                <div className="flex-1">
                  <p className="text-gray-400 text-xs md:text-sm mb-1">Quantum vulnerability assessment</p>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <h3 className="text-2xl md:text-3xl font-bold text-[#FF4D4D]">{resultSummary.risk === "CRITICAL" ? "Critical Risk" : resultSummary.risk}</h3>
                    <div className="px-3 py-1 bg-[#FF4D4D]/20 border border-[#FF4D4D]/30 rounded-full">
                      <span className="text-xs font-bold text-[#FF4D4D]">HIGH PRIORITY</span>
                    </div>
                  </div>
                </div>
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-[#FF4D4D]/20 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 md:w-6 md:h-6 text-[#FF4D4D]" />
                </div>
              </div>
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                <div className="flex-1 max-w-full lg:max-w-md space-y-3">
                  <p className="text-sm md:text-base text-gray-300">
                    {result?.analysis?.summary || "This certificate is vulnerable to quantum computing attacks using Shor's algorithm."}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(result?.analysis?.reasons || ["Vulnerable to Shor's Algorithm", "Post-2030 Risk: Extreme"]).slice(0, 4).map((reason: string) => (
                      <div key={reason} className="px-3 py-1 bg-[#FF4D4D]/10 border border-[#FF4D4D]/20 rounded-lg text-xs text-[#FF4D4D]">
                        {reason}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="self-center lg:self-auto">
                  <CircularGauge percentage={result?.analysis?.vulnerabilityScore ?? undefined} label="Vulnerability Index" color="#FF4D4D" />

                  <div className="mt-3 text-sm text-gray-300 text-center">
                    <div className="flex items-center justify-center gap-3">
                      <div className="px-3 py-1 bg-[#0B0E14] border border-[#1e2532] rounded-md">
                        <div className="text-xs text-gray-400">Classical</div>
                        <div className="text-sm font-bold text-[#00FF94]">{result?.analysis?.classicalScore ?? scores.classical}%</div>
                      </div>
                      <div className="px-3 py-1 bg-[#0B0E14] border border-[#1e2532] rounded-md">
                        <div className="text-xs text-gray-400">Quantum urgency</div>
                        <div className="text-sm font-bold text-[#FF4D4D]">{result?.analysis?.quantumScore ?? scores.quantum}%</div>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-gray-400">Higher quantum % means greater urgency to migrate to PQC.</div>
                  </div>
                </div>
              </div>
            </BentoCard>

            <BentoCard delay={0.3} className="col-span-1 md:col-span-2">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-gray-400 text-xs md:text-sm mb-1">NIST FIPS 203 recommendation</p>
                  <h3 className="text-xl md:text-2xl font-bold text-white">ML-KEM-768</h3>
                </div>
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-[#00FF94]/20 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 md:w-6 md:h-6 text-[#00FF94]" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-[#0B0E14] rounded-lg p-4 border border-[#1e2532]">
                  <div className="text-xs text-gray-400 mb-1">Recommended algorithm</div>
                  <div className="text-sm font-bold text-[#00FF94]">ML-KEM (Kyber)</div>
                  <div className="text-xs text-gray-500 mt-1">Module-lattice-based</div>
                </div>
                <div className="bg-[#0B0E14] rounded-lg p-4 border border-[#1e2532]">
                  <div className="text-xs text-gray-400 mb-1">Security level</div>
                  <div className="text-sm font-bold text-[#00A3FF]">Level 3 (AES-192)</div>
                  <div className="text-xs text-gray-500 mt-1">768-bit parameter</div>
                </div>
                <div className="bg-[#0B0E14] rounded-lg p-4 border border-[#1e2532]">
                  <div className="text-xs text-gray-400 mb-1">Implementation status</div>
                  <div className="text-sm font-bold text-[#00FF94]">Standardized 2024</div>
                  <div className="text-xs text-gray-500 mt-1">Production ready</div>
                </div>
              </div>
              <div className="mt-4 p-4 bg-[#00FF94]/10 border border-[#00FF94]/20 rounded-lg">
                <p className="text-xs md:text-sm text-gray-300">
                  <span className="font-bold text-[#00FF94]">Migration path:</span> Implement hybrid TLS with ML-KEM-768 + X25519 to keep both quantum-safe and classical security during transition.
                </p>
              </div>
            </BentoCard>
          </div>

          <ScanHistoryList
            scans={recentScans}
            title="Recent scans"
            subtitle="History"
            emptyMessage="No scans yet. Run an audit to populate the history."
            delay={0.15}
          />
          {historyError && (
            <div className="rounded-lg border border-[#FFB84D]/20 bg-[#FFB84D]/10 px-4 py-3 text-sm text-[#FFB84D]">
              {historyError}
            </div>
          )}
        </div>
      )}

      {state === "error" && (
        <BentoCard>
          <div className="text-center py-4 md:py-6">
            <AlertTriangle className="w-12 h-12 text-[#FF4D4D] mx-auto mb-4" />
            <h3 className="text-lg font-bold text-white">Audit failed</h3>
            <p className="text-sm text-gray-400 mt-2 max-w-2xl mx-auto">{errorMessage || "Unable to contact the audit backend. Try again later."}</p>
            <div className="mt-4">
              <button onClick={handleReset} className="px-4 py-2 bg-[#00A3FF] text-white rounded-lg">Back</button>
            </div>
          </div>
        </BentoCard>
      )}

      {state === "empty" && null}
    </div>
  );
}