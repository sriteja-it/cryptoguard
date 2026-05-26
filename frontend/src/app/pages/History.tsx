import { useEffect, useMemo, useState } from "react";
import { RefreshCw, History as HistoryIcon } from "lucide-react";
import BentoCard from "../components/BentoCard";
import ScanHistoryList from "../components/ScanHistoryList";
import ActionDialog from "../components/ActionDialog";
import { ScanItem } from "../types";
import { config } from "../../utils/config";
import { getFetchErrorMessage, readJson, resolveApiError } from "../../utils/api";
import { useLocation, useNavigate } from "react-router";

function getQueryParam(locSearch: string, key: string) {
  try {
    const params = new URLSearchParams(locSearch);
    return params.get(key) || '';
  } catch { return ''; }
}

export default function History() {
  const [scans, setScans] = useState<ScanItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>("");
  const [deleteTarget, setDeleteTarget] = useState<ScanItem | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const loadScans = async () => {
    setLoading(true);
    try {
      const apiUrl = `${config.apiBaseUrl.replace(/\/+$/, "")}/api/scans?limit=100`;
      const resp = await fetch(apiUrl, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
      });

      if (!resp.ok) {
        setScans([]);
        setLoadError(await readJson<{ error?: string; details?: string }>(resp).then((payload) => resolveApiError(payload, "Unable to load scan history.")));
        return;
      }

      const data = await resp.json();
      setScans(Array.isArray(data?.scans) ? data.scans : []);
      setLoadError("");
    } catch (error) {
      setScans([]);
      setLoadError(getFetchErrorMessage(error, "Unable to load scan history."));
    } finally {
      setLoading(false);
    }
  };

  const deleteScan = async (scan: ScanItem) => {
    setDeleteTarget(scan);
  };

  const confirmDeleteScan = async () => {
    if (!deleteTarget) return;
    try {
      const resp = await fetch(`${config.apiBaseUrl.replace(/\/+$/, "")}/api/scans/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${config.apiKey}` },
      });
      if (!resp.ok) {
        const err = await readJson<{ error?: string; details?: string }>(resp);
        window.alert(`Delete failed: ${resolveApiError(err, resp.statusText || "Unknown error")}`);
        return;
      }
      await loadScans();
    } catch (error) {
      window.alert(`Delete request failed: ${getFetchErrorMessage(error, 'Network error')}`);
    } finally {
      setDeleteTarget(null);
    }
  };

  const confirmBulkDelete = async () => {
    try {
      const resp = await fetch(`${config.apiBaseUrl.replace(/\/+$/, "")}/api/scans`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${config.apiKey}` },
      });
      if (!resp.ok) {
        const err = await readJson<{ error?: string; details?: string }>(resp);
        window.alert(`Delete failed: ${resolveApiError(err, resp.statusText || "Unknown error")}`);
        return;
      }
      await loadScans();
    } catch (error) {
      window.alert(`Delete request failed: ${getFetchErrorMessage(error, 'Network error')}`);
    } finally {
      setBulkDeleteOpen(false);
    }
  };

  useEffect(() => {
    const q = getQueryParam(location.search, 'q');
    if (q) setSearchTerm(q);
    loadScans();
  }, []);

  const counts = useMemo(() => {
    const total = scans.length;
    const critical = scans.filter((scan) => (scan.analysis?.riskLevel || "").toUpperCase() === "CRITICAL").length;
    return { total, critical };
  }, [scans]);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">Scan History</h1>
          <p className="text-sm md:text-base text-gray-400">
            Browse every stored audit and open the full certificate record inline.
          </p>
        </div>
        <button
          type="button"
          onClick={loadScans}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#151921] border border-[#1e2532] text-white hover:border-[#00A3FF] transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
        <button
          type="button"
          onClick={() => setBulkDeleteOpen(true)}
          disabled={scans.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#FF4D4D]/30 text-[#FF4D4D] hover:bg-[#FF4D4D]/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Delete all
        </button>
      </div>

      {loadError && (
        <div className="rounded-lg border border-[#FFB84D]/20 bg-[#FFB84D]/10 px-4 py-3 text-sm text-[#FFB84D]">
          {loadError}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <BentoCard>
          <p className="text-xs text-gray-400 mb-1">Total Scans</p>
          <p className="text-2xl font-bold text-white">{counts.total}</p>
        </BentoCard>
        <BentoCard>
          <p className="text-xs text-gray-400 mb-1">Critical Findings</p>
          <p className="text-2xl font-bold text-[#FF4D4D]">{counts.critical}</p>
        </BentoCard>
        <BentoCard>
          <p className="text-xs text-gray-400 mb-1">Source</p>
          <p className="text-2xl font-bold text-[#00A3FF] flex items-center gap-2">
            <HistoryIcon className="w-5 h-5" /> MongoDB
          </p>
        </BentoCard>
      </div>

      <ScanHistoryList
        scans={scans}
        title={loading ? "Loading scans..." : "Stored audits"}
        subtitle="History"
        emptyMessage="No saved scans found yet. Run a dashboard audit first."
        showSearch
        searchTerm={searchTerm}
        onSearchTermChange={(v) => {
          setSearchTerm(v);
          navigate(`/history?q=${encodeURIComponent(v)}`, { replace: true });
        }}
        onDeleteScan={deleteScan}
        className="shadow-none"
        delay={0}
      />

      <ActionDialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete scan"
        description={deleteTarget ? `Delete scan #${deleteTarget.id} for ${deleteTarget.url}? This cannot be undone.` : "Delete this scan from history."}
        confirmLabel="Delete"
        cancelLabel="Keep"
        destructive
        onConfirm={confirmDeleteScan}
      />

      <ActionDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title="Delete all scans"
        description="Delete every stored scan tied to your current API key? This cannot be undone."
        confirmLabel="Delete all"
        cancelLabel="Keep"
        destructive
        onConfirm={confirmBulkDelete}
      />
    </div>
  );
}