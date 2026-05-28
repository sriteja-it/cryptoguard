import { useMemo, useState } from "react";
import { Clock3, ChevronDown, ChevronUp, Copy, ShieldAlert, ShieldCheck, AlertTriangle, Trash2 } from "lucide-react";
import BentoCard from "./BentoCard";
import { ScanItem } from "../types";

interface ScanHistoryListProps {
  scans: ScanItem[];
  title: string;
  subtitle: string;
  emptyMessage: string;
  className?: string;
  delay?: number;
  showSearch?: boolean;
  searchTerm?: string;
  onSearchTermChange?: (value: string) => void;
  onDeleteScan?: (scan: ScanItem) => void;
}

const formatValue = (value: unknown) => {
  if (value == null || value === "") return "Unknown";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const searchableText = (scan: ScanItem) =>
  [
    scan.url,
    scan.certInfo?.publicKeyType,
    scan.certInfo?.publicKeySize,
    scan.certInfo?.tlsVersion,
    scan.certInfo?.serialNumber,
    scan.certInfo?.signatureAlgorithm,
    scan.analysis?.riskLevel,
    scan.analysis?.reasons?.join(" "),
    scan.analysis?.recommendations?.join(" "),
    scan.certInfo?.subject ? Object.values(scan.certInfo.subject).join(" ") : "",
    scan.certInfo?.issuer ? Object.values(scan.certInfo.issuer).join(" ") : "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

const riskTone = (riskLevel?: string) => {
  const value = (riskLevel || "UNKNOWN").toUpperCase();
  if (value === "CRITICAL") return "text-[#FF4D4D] bg-[#FF4D4D]/10 border-[#FF4D4D]/20";
  if (value === "HIGH") return "text-[#FFB84D] bg-[#FFB84D]/10 border-[#FFB84D]/20";
  if (value === "MEDIUM") return "text-[#00A3FF] bg-[#00A3FF]/10 border-[#00A3FF]/20";
  return "text-gray-300 bg-[#1e2532] border-[#2b3343]";
};

export default function ScanHistoryList({
  scans,
  title,
  subtitle,
  emptyMessage,
  className,
  delay,
  showSearch = false,
  searchTerm,
  onSearchTermChange,
  onDeleteScan,
}: ScanHistoryListProps) {
  const [expandedScanId, setExpandedScanId] = useState<number | null>(null);
  const [copiedScanId, setCopiedScanId] = useState<number | null>(null);

  const filteredScans = useMemo(() => {
    if (!searchTerm?.trim()) return scans;
    const normalized = searchTerm.trim().toLowerCase();
    return scans.filter((scan) => searchableText(scan).includes(normalized));
  }, [scans, searchTerm]);

  const copyScanDetails = async (scan: ScanItem) => {
    if (!navigator?.clipboard?.writeText) return;
    await navigator.clipboard.writeText(JSON.stringify(scan, null, 2));
    setCopiedScanId(scan.id);
    window.setTimeout(() => {
      setCopiedScanId((current) => (current === scan.id ? null : current));
    }, 1800);
  };

  return (
    <BentoCard delay={delay} className={className}>
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          <p className="text-gray-400 text-xs md:text-sm mb-1">{subtitle}</p>
          <h3 className="text-xl md:text-2xl font-bold text-white">{title}</h3>
        </div>
        <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-[#00A3FF]/20 flex items-center justify-center">
          <Clock3 className="w-5 h-5 md:w-6 md:h-6 text-[#00A3FF]" />
        </div>
      </div>

      {showSearch && onSearchTermChange && (
        <div className="mb-4">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchTermChange(e.target.value)}
            placeholder="Search URL, issuer, key type, or recommendation..."
            className="w-full bg-[#0B0E14] border border-[#1e2532] rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#00A3FF] transition-colors text-sm"
          />
        </div>
      )}

      <div className="space-y-3">
        {filteredScans.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#1e2532] bg-[#0B0E14] px-4 py-6 text-sm text-gray-500">
            {emptyMessage}
          </div>
        ) : (
          filteredScans.map((scan) => {
            const isExpanded = expandedScanId === scan.id;
            const riskLevel = (scan.analysis?.riskLevel || "UNKNOWN").toUpperCase();
            const riskClass = riskTone(scan.analysis?.riskLevel);
            const isCritical = riskLevel === "CRITICAL";

            return (
              <div key={scan.id} className="bg-[#0B0E14] rounded-lg border border-[#1e2532] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedScanId(isExpanded ? null : scan.id)}
                  className="w-full p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-left hover:bg-[#121722] transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 w-8 h-8 rounded-lg border flex items-center justify-center ${isCritical ? "bg-[#FF4D4D]/10 border-[#FF4D4D]/20" : "bg-[#00A3FF]/10 border-[#00A3FF]/20"}`}>
                      {isCritical ? <ShieldAlert className="w-4 h-4 text-[#FF4D4D]" /> : <ShieldCheck className="w-4 h-4 text-[#00A3FF]" />}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white break-all">{scan.url}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {scan.certInfo?.publicKeyType || "Unknown"}{" "}
                        {scan.certInfo?.publicKeySize ? `${scan.certInfo.publicKeySize}-bit` : ""} • {scan.certInfo?.tlsVersion || "TLS unknown"}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400 sm:text-right">
                    <div className="space-y-2">
                      <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border ${riskClass}`}>
                        {isCritical ? <AlertTriangle className="w-3 h-3" /> : null}
                        <span className="font-semibold">{riskLevel} RISK</span>
                      </div>
                      <div>{new Date(scan.scannedAt).toLocaleString()}</div>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-[#1e2532] p-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-300">
                    <div className="md:col-span-2 flex justify-end gap-2">
                      {onDeleteScan && (
                        <button
                          type="button"
                          onClick={() => onDeleteScan(scan)}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#FF4D4D]/30 text-[#FF4D4D] hover:bg-[#FF4D4D]/10 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => copyScanDetails(scan)}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#1e2532] text-gray-300 hover:text-white hover:border-[#00A3FF] transition-colors"
                      >
                        <Copy className="w-4 h-4" />
                        {copiedScanId === scan.id ? "Copied JSON" : "Copy JSON"}
                      </button>
                    </div>
                    <div>
                      <div className="text-gray-500 mb-1">Certificate Subject</div>
                      <div className="break-words">{formatValue(scan.certInfo?.subject)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 mb-1">Certificate Issuer</div>
                      <div className="break-words">{formatValue(scan.certInfo?.issuer)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 mb-1">Serial Number</div>
                      <div className="break-words">{formatValue(scan.certInfo?.serialNumber)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 mb-1">Signature Algorithm</div>
                      <div className="break-words">{formatValue(scan.certInfo?.signatureAlgorithm)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 mb-1">Risk Reasons</div>
                      <div className="break-words">{formatValue(scan.analysis?.reasons)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 mb-1">Recommendations</div>
                      <div className="break-words">{formatValue(scan.analysis?.recommendations)}</div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </BentoCard>
  );
}