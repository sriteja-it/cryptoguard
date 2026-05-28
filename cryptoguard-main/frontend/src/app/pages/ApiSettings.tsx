import { useEffect, useMemo, useState } from "react";
import { Copy, RefreshCw, Trash2, CheckCircle2, Shield, ArrowUpRight, Database, Globe, Eye, EyeOff, Key } from "lucide-react";
import BentoCard from "../components/BentoCard";
import ActionDialog, { ActionDialogField } from "../components/ActionDialog";
import { motion } from "motion/react";
import {
  clearApiKeyOverride,
  config,
  getMaskedApiKey,
  setApiKeyOverride,
  getApiBaseUrl,
  setApiBaseUrlOverride,
  clearApiBaseUrlOverride,
} from "../../utils/config";
import { getFetchErrorMessage, readJson, resolveApiError } from "../../utils/api";

// Fallback component for the missing KeyStatusIcon layout block
function KeyStatusIcon() {
  return <Key className="w-5 h-5 text-[#00A3FF]" />;
}

export default function ApiSettings() {
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [apiBase, setApiBase] = useState(getApiBaseUrl());
  const [baseSaved, setBaseSaved] = useState(false);
  const [usageCount, setUsageCount] = useState<number | null>(null);
  const [quota, setQuota] = useState<number | null>(null);
  const [scans, setScans] = useState<any[]>([]);
  const [adminKeys, setAdminKeys] = useState<any[] | null>(null);
  const [bannerMessage, setBannerMessage] = useState<string>("");
  const [activeDialog, setActiveDialog] = useState<
    | { kind: "revoke" }
    | { kind: "upgrade" }
    | { kind: "setQuota" }
    | { kind: "showKeys" }
    | { kind: "setAllQuota" }
    | { kind: "setSingleQuota"; adminKey: any }
    | null
  >(null);
  const maskedKey = getMaskedApiKey(apiKey);

  const remaining = useMemo(() => {
    if (quota == null) return null;
    return Math.max(0, quota - (usageCount ?? 0));
  }, [quota, usageCount]);

  const usagePct = useMemo(() => {
    if (quota == null || quota <= 0 || usageCount == null) return 0;
    return Math.min(100, Math.round((usageCount / quota) * 100));
  }, [quota, usageCount]);

  const syncKey = (nextKey: string) => {
    setApiKey(nextKey);
    setApiKeyOverride(nextKey);
    setShowKey(false);
    void loadUsage(nextKey);
  };

  const loadUsage = async (key?: string) => {
    try {
      const currentKey = key || config.apiKey;
      if (!currentKey) {
        setUsageCount(null);
        setQuota(null);
        return;
      }

      const resp = await fetch(`${config.apiBaseUrl.replace(/\/+$/, "")}/api/usage`, {
        headers: { Authorization: `Bearer ${currentKey}` },
      });

      if (!resp.ok) {
        setUsageCount(null);
        setQuota(null);
        setBannerMessage(await readJson<{ error?: string; details?: string }>(resp).then((payload) => resolveApiError(payload, "Unable to load usage from the backend.")));
        return;
      }

      const data = await resp.json();
      setUsageCount(typeof data.usage_count === "number" ? data.usage_count : null);
      setQuota(typeof data.quota === "number" ? data.quota : null);
      setBannerMessage("");
    } catch (error) {
      setUsageCount(null);
      setQuota(null);
      setBannerMessage(getFetchErrorMessage(error, "Unable to load usage from the backend."));
    }
  };

  const loadScans = async (key?: string) => {
    try {
      const currentKey = key || config.apiKey;
      const url = `${config.apiBaseUrl.replace(/\/+$/, '')}/api/scans?limit=5`;
      const headers: Record<string, string> = {};
      if (currentKey) headers.Authorization = `Bearer ${currentKey}`;
      const resp = await fetch(url, { headers });
      if (!resp.ok) {
        setScans([]);
        setBannerMessage(await readJson<{ error?: string; details?: string }>(resp).then((payload) => resolveApiError(payload, "Unable to load recent scans.")));
        return;
      }
      const data = await resp.json();
      setScans(Array.isArray(data.scans) ? data.scans : []);
      if (data.apiKey) {
        setUsageCount(typeof data.apiKey.usage_count === 'number' ? data.apiKey.usage_count : (usageCount ?? null));
        setQuota(typeof data.apiKey.quota === 'number' ? data.apiKey.quota : (data.apiKey.quota == null ? null : quota));
      }
      setBannerMessage("");
    } catch (error) {
      setScans([]);
      setBannerMessage(getFetchErrorMessage(error, "Unable to load recent scans."));
    }
  };

  useEffect(() => {
    loadUsage(apiKey);
    loadScans(apiKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  useEffect(() => {
    if (!apiKey) return undefined;
    const id = setInterval(() => {
      refreshAll();
    }, 15000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  const getAdminToken = () => import.meta.env.VITE_ADMIN_TOKEN || "dev_admin_token";

  // Helper utility to fetch internal database keys list for resolving identifiers
  const resolveKeyIdFromCurrentKey = async (adminToken: string) => {
    const freshKeys = await fetchAdminKeys(adminToken);
    const currentFingerprint = await fingerprintKey(apiKey);
    const matchingKey = freshKeys.find((k: any) => k.keyFingerprint === currentFingerprint);
    if (!matchingKey) {
      throw new Error("Could not find database record identity matches for this client session.");
    }
    return matchingKey.id;
  };

  const handleGenerateKey = () => {
    (async () => {
      try {
        const resp = await fetch(`${config.apiBaseUrl.replace(/\/+$/, "")}/admin/create-key`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-admin-token": getAdminToken() },
          body: JSON.stringify({}),
        });

        if (!resp.ok) {
          const err = await readJson<{ error?: string; details?: string }>(resp);
          window.alert(`Create key failed: ${resolveApiError(err, resp.statusText || "Unknown error")}`);
          return;
        }

        const data = await resp.json();
        if (!data.plaintext) {
          window.alert("Create key did not return plaintext");
          return;
        }

        syncKey(data.plaintext);
        window.alert("New API key created and saved in this browser.");
      } catch {
        window.alert("Create key request failed");
      }
    })();
  };

  const handleRevokeKey = async (values: Record<string, string>) => {
    const admin = values.adminToken.trim();
    const action = values.action === "delete" ? "delete" : "expire";
    const keyId = await resolveKeyIdFromCurrentKey(admin);
    const resp = await fetch(`${config.apiBaseUrl.replace(/\/+$/, "")}/admin/revoke-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": admin },
      body: JSON.stringify({ keyId, action }),
    });

    if (!resp.ok) {
      const err = await readJson<{ error?: string; details?: string }>(resp);
      throw new Error(`Revoke failed: ${resolveApiError(err, resp.statusText || "Unknown error")}`);
    }

    clearApiKeyOverride();
    setApiKey(config.apiKey);
    setShowKey(false);
    void loadUsage(config.apiKey);
    window.alert("Key revoked. Scan history is preserved.");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const refreshUsage = () => loadUsage(apiKey);

  const refreshAll = () => {
    void loadUsage(apiKey);
    void loadScans(apiKey);
  };

  const loadAdminKeys = async (adminToken: string) => {
    try {
      const resp = await fetch(`${config.apiBaseUrl.replace(/\/+$/, '')}/admin/keys`, {
        headers: { 'x-admin-token': adminToken },
      });
      if (!resp.ok) {
        setAdminKeys(null);
        setBannerMessage(await readJson<{ error?: string; details?: string }>(resp).then((payload) => resolveApiError(payload, "Unable to load admin keys.")));
        return;
      }
      const data = await resp.json();
      setAdminKeys(Array.isArray(data.keys) ? data.keys : null);
      setBannerMessage("");
    } catch (error) {
      setAdminKeys(null);
      setBannerMessage(getFetchErrorMessage(error, "Unable to load admin keys."));
    }
  };

  const fetchAdminKeys = async (adminToken: string) => {
    const resp = await fetch(`${config.apiBaseUrl.replace(/\/+$/, '')}/admin/keys`, {
      headers: { 'x-admin-token': adminToken },
    });
    if (!resp.ok) {
      const err = await readJson<{ error?: string; details?: string }>(resp);
      throw new Error(`Unable to load admin keys: ${resolveApiError(err, resp.statusText || 'Unknown error')}`);
    }
    const data = await resp.json();
    const keys = Array.isArray(data.keys) ? data.keys : [];
    setAdminKeys(keys);
    return keys;
  };

  const fingerprintKey = async (key: string) => {
    const bytes = new TextEncoder().encode(key);
    const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(hashBuffer))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 16);
  };

  const submitDialog = async (values: Record<string, string>) => {
    if (!activeDialog) return;

    if (activeDialog.kind === "revoke") {
      await handleRevokeKey(values);
      return;
    }

    if (activeDialog.kind === "upgrade") {
      const keyId = await resolveKeyIdFromCurrentKey(values.adminToken);
      const resp = await fetch(`${config.apiBaseUrl.replace(/\/+$/, "")}/admin/upgrade`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": values.adminToken },
        body: JSON.stringify({ keyId }),
      });
      if (!resp.ok) {
        const err = await readJson<{ error?: string; details?: string }>(resp);
        throw new Error(`Upgrade failed: ${resolveApiError(err, resp.statusText || "Unknown error")}`);
      }
      window.alert("API key upgraded to Research. Refresh usage to see the unlimited status.");
      refreshUsage();
      return;
    }

    if (activeDialog.kind === "setQuota") {
      const adminKeysList = adminKeys ?? (await fetchAdminKeys(values.adminToken));
      const currentFingerprint = await fingerprintKey(apiKey);
      const matchingKey = (adminKeysList ?? []).find((k) => k.keyFingerprint === currentFingerprint);
      if (!matchingKey) {
        throw new Error("Could not match the current key to an admin key ID. Refresh the key list and try again.");
      }

      const resp = await fetch(`${config.apiBaseUrl.replace(/\/+$/, "")}/admin/set-quota`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": values.adminToken },
        body: JSON.stringify({ keyId: matchingKey.id, quota: 5 }), // Fixed undefined variable crash
      });
      if (!resp.ok) {
        const err = await readJson<{ error?: string; details?: string }>(resp);
        throw new Error(`Set quota failed: ${resolveApiError(err, resp.statusText || "Unknown error")}`);
      }
      window.alert("Quota set to 5 for this key. Refreshing usage.");
      refreshUsage();
      return;
    }

    if (activeDialog.kind === "showKeys") {
      await loadAdminKeys(values.adminToken);
      return;
    }

    if (activeDialog.kind === "setAllQuota") {
      const resp = await fetch(`${config.apiBaseUrl.replace(/\/+$/, "")}/admin/set-quota-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": values.adminToken },
        body: JSON.stringify({ quota: 5 }),
      });
      if (!resp.ok) {
        const err = await readJson<{ error?: string; details?: string }>(resp);
        throw new Error(`Set all quota failed: ${resolveApiError(err, resp.statusText || "Unknown error")}`);
      }
      window.alert("All API keys updated to quota=5");
      refreshAll();
      if (values.adminToken) await loadAdminKeys(values.adminToken);
      return;
    }

    if (activeDialog.kind === "setSingleQuota") {
      const resp = await fetch(`${config.apiBaseUrl.replace(/\/+$/, "")}/admin/set-quota`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": values.adminToken },
        body: JSON.stringify({ keyId: activeDialog.adminKey.id, quota: 5 }),
      });
      if (!resp.ok) {
        const err = await readJson<{ error?: string; details?: string }>(resp);
        throw new Error(`Set quota failed: ${resolveApiError(err, resp.statusText || "Unknown error")}`);
      }
      window.alert("Quota set to 5. Refreshing admin keys.");
      if (values.adminToken) await loadAdminKeys(values.adminToken);
    }
  };

  const dialogFields = (): ActionDialogField[] => {
    if (!activeDialog) return [];
    if (activeDialog.kind === "revoke") {
      return [
        { name: "adminToken", label: "Admin token", placeholder: "dev_admin_token", type: "password", required: true },
        {
          name: "action",
          label: "Revoke mode",
          defaultValue: "expire",
          options: [
            { label: "Expire key only", value: "expire" },
            { label: "Permanently delete key", value: "delete" },
          ],
        },
      ];
    }

    if (activeDialog.kind === "setSingleQuota") {
      return [
        { name: "adminToken", label: "Admin token", placeholder: "dev_admin_token", type: "password", required: true },
      ];
    }

    if (activeDialog.kind === "upgrade" || activeDialog.kind === "setQuota" || activeDialog.kind === "showKeys" || activeDialog.kind === "setAllQuota") {
      return [{ name: "adminToken", label: "Admin token", placeholder: "dev_admin_token", type: "password", required: true }];
    }

    return [];
  };

  const dialogMeta = (() => {
    if (!activeDialog) return null;
    switch (activeDialog.kind) {
      case "revoke":
        return {
          title: "Revoke API key",
          description: "Choose whether to expire the key or delete it permanently. Scan history stays in MongoDB.",
          confirmLabel: "Revoke Key",
          destructive: true,
        };
      case "upgrade":
        return {
          title: "Upgrade to Research",
          description: "Enter the admin token to convert this key to unlimited Research access.",
          confirmLabel: "Upgrade",
          destructive: false,
        };
      case "setQuota":
        return {
          title: "Set key quota to 5",
          description: "Enter the admin token to update this key's quota to 5 scans.",
          confirmLabel: "Set Quota",
          destructive: false,
        };
      case "showKeys":
        return {
          title: "Show all API keys",
          description: "Enter the admin token to fetch the key list from the backend.",
          confirmLabel: "Show Keys",
          destructive: false,
        };
      case "setAllQuota":
        return {
          title: "Set quota for all keys",
          description: "Enter the admin token to set every API key to quota 5.",
          confirmLabel: "Set All",
          destructive: true,
        };
      case "setSingleQuota":
        return {
          title: `Set quota for ${activeDialog.adminKey?.name || "one key"}`,
          description: `Enter the admin token to update ${activeDialog.adminKey?.name || "this entry"} (ID #${activeDialog.adminKey?.id}) to quota 5.`,
          confirmLabel: "Set Quota",
          destructive: false,
        };
      default:
        return null;
    }
  })();

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <BentoCard>
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#00A3FF]/20 bg-[#00A3FF]/10 text-[#00A3FF] text-xs font-semibold">
              <Shield className="w-3.5 h-3.5" />
              Access console
            </div>
            <div>
              <h1 className="text-2xl md:text-4xl font-bold text-white">API settings and key lifecycle</h1>
              <p className="mt-3 text-sm md:text-base text-gray-400 max-w-2xl">
                Change the backend URL, view the active key, generate or revoke a key, and check live usage without digging through multiple screens.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-[#1e2532] bg-[#0B0E14] px-4 py-3 text-sm text-gray-300">Generate a new key for the browser</div>
              <div className="rounded-xl border border-[#1e2532] bg-[#0B0E14] px-4 py-3 text-sm text-gray-300">Expire or delete the current key</div>
              <div className="rounded-xl border border-[#1e2532] bg-[#0B0E14] px-4 py-3 text-sm text-gray-300">Usage persists in MongoDB</div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#1e2532] bg-[#0B0E14] p-4 md:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400">Current key state</p>
                <p className="text-sm font-semibold text-white">{apiKey ? (showKey ? "Visible" : "Masked") : "No key loaded"}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-[#00A3FF]/10 border border-[#00A3FF]/20 flex items-center justify-center">
                <KeyStatusIcon />
              </div>
            </div>
            <div className="text-sm text-gray-300 space-y-2">
              <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#00FF94]" /> Activated in this app instantly</div>
              <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#00FF94]" /> Backend still keeps scan history</div>
            </div>
          </div>
        </div>
      </BentoCard>

      {bannerMessage && (
        <div className="rounded-lg border border-[#FFB84D]/20 bg-[#FFB84D]/10 px-4 py-3 text-sm text-[#FFB84D]">
          {bannerMessage}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-6">
        <BentoCard>
          <div className="space-y-4">
            <div>
              <h2 className="text-lg md:text-xl font-bold text-white">Connection</h2>
              <p className="text-sm text-gray-400">Point the UI at the backend you want to use.</p>
            </div>

            <div>
              <label className="block text-xs md:text-sm font-medium text-gray-300 mb-2">API Base URL</label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  value={apiBase}
                  onChange={(e) => setApiBase(e.target.value)}
                  className="flex-1 bg-[#0B0E14] border border-[#1e2532] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#00A3FF]"
                />
                <button
                  onClick={() => {
                    setApiBaseUrlOverride(apiBase); // Fixed structural configuration save argument bug
                    setBaseSaved(true);
                    window.setTimeout(() => setBaseSaved(false), 1500);
                  }}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#00A3FF] text-black rounded-lg font-semibold"
                >
                  <Globe className="w-4 h-4" />
                  Save
                </button>
                <button
                  onClick={() => {
                    clearApiBaseUrlOverride();
                    setApiBase(getApiBaseUrl());
                  }}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#151921] text-white rounded-lg border border-[#1e2532]"
                >
                  Reset
                </button>
              </div>
              {baseSaved && <div className="text-xs text-[#00FF94] mt-2">Saved</div>}
            </div>

            <div className="rounded-lg border border-[#1e2532] bg-[#0B0E14] p-4 text-xs text-gray-400 flex items-start gap-3">
              <Database className="w-4 h-4 text-[#00A3FF] mt-0.5 flex-shrink-0" />
              <p>
                Tip: if you switch the backend URL, refresh the usage panel so the key and quota match the new server.
              </p>
            </div>
          </div>
        </BentoCard>

        <BentoCard>
          <div className="space-y-4">
            <div>
              <h2 className="text-lg md:text-xl font-bold text-white">API key</h2>
              <p className="text-sm text-gray-400">The currently active key is shown here and used automatically for audits.</p>
            </div>

            <div>
              <label className="block text-xs md:text-sm font-medium text-gray-300 mb-2">Active API Key</label>
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={apiKey ? (showKey ? apiKey : maskedKey) : maskedKey}
                    readOnly
                    className="w-full bg-[#0B0E14] border border-[#1e2532] rounded-lg px-3 md:px-4 py-3 pr-20 md:pr-24 text-white font-mono text-xs md:text-sm focus:outline-none focus:border-[#00A3FF] transition-colors"
                  />
                  <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex gap-2">
                    <button onClick={() => setShowKey((current) => !current)} className="p-2 hover:bg-[#1e2532] rounded-lg transition-colors" title={showKey ? "Hide key" : "Show key"}>
                      {showKey ? <EyeOff className="w-4 h-4 text-gray-400" /> : <Eye className="w-4 h-4 text-gray-400" />}
                    </button>
                    <button onClick={handleCopy} className="p-2 hover:bg-[#1e2532] rounded-lg transition-colors" title="Copy to clipboard">
                      {copied ? <CheckCircle2 className="w-4 h-4 text-[#00FF94]" /> : <Copy className="w-4 h-4 text-gray-400" />}
                    </button>
                  </div>
                </div>
              </div>
              {!apiKey && (
                <div className="text-xs text-[#FFB84D] mt-2">
                  No API key is loaded yet. Click Generate New Key to create one.
                </div>
              )}
              {copied && (
                <motion.p initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-xs text-[#00FF94] mt-2">
                  API key copied to clipboard.
                </motion.p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={handleGenerateKey} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#00A3FF]/20 border border-[#00A3FF]/30 text-[#00A3FF] rounded-lg hover:bg-[#00A3FF]/30 transition-colors text-sm">
                <RefreshCw className="w-4 h-4" />
                <span>Generate New Key</span>
              </button>
              <button onClick={() => setActiveDialog({ kind: "revoke" })} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#FF4D4D]/20 border border-[#FF4D4D]/30 text-[#FF4D4D] rounded-lg hover:bg-[#FF4D4D]/30 transition-colors text-sm">
                <Trash2 className="w-4 h-4" />
                <span>Revoke Key</span>
              </button>
              <button
                onClick={() => setActiveDialog({ kind: "upgrade" })}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#00FF94]/20 border border-[#00FF94]/30 text-[#00FF94] rounded-lg hover:bg-[#00FF94]/30 transition-colors text-sm"
              >
                <ArrowUpRight className="w-4 h-4" />
                <span>Upgrade to Research</span>
              </button>
              <button
                onClick={() => setActiveDialog({ kind: "setQuota" })}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#151921] border border-[#1e2532] text-white rounded-lg hover:bg-[#1e2532] transition-colors text-sm"
              >
                <CheckCircle2 className="w-4 h-4 text-[#00FF94]" />
                <span>Set Limit to 5</span>
              </button>
            </div>

            <div className="rounded-lg border border-[#00A3FF]/20 bg-[#00A3FF]/10 p-3 md:p-4 text-xs text-gray-300">
              Revoking or replacing a key does not remove scan history from MongoDB.
            </div>
          </div>
        </BentoCard>
      </div>

      <BentoCard>
        <div className="space-y-4 md:space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg md:text-xl font-bold text-white">Usage & quota</h2>
              <p className="text-sm text-gray-400">Live values from the backend for the currently selected key.</p>
            </div>
            <button onClick={refreshAll} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#151921] border border-[#1e2532] text-white hover:border-[#00A3FF] transition-colors text-sm">
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
            <div className="bg-[#0B0E14] rounded-lg p-4 border border-[#1e2532]">
              <p className="text-xs text-gray-400 mb-1">Scans used</p>
              <p className="text-xl md:text-2xl font-bold text-white">{usageCount ?? '—'}</p>
            </div>
            <div className="bg-[#0B0E14] rounded-lg p-4 border border-[#1e2532]">
              <p className="text-xs text-gray-400 mb-1">Remaining</p>
              <p className={`text-xl md:text-2xl font-bold ${remaining == null ? 'text-gray-300' : 'text-[#00FF94]'}`}>{remaining == null ? '—' : remaining}</p>
            </div>
            <div className="bg-[#0B0E14] rounded-lg p-4 border border-[#1e2532]">
              <p className="text-xs text-gray-400 mb-1">Quota</p>
              <p className="text-xl md:text-2xl font-bold text-[#00A3FF]">{quota == null ? '—' : quota}</p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm text-gray-300 font-medium">Monthly scans</p>
                <p className="text-xs text-gray-500">Basic tier limit</p>
              </div>
              <div className="text-right">
                <p className="text-xl md:text-2xl font-bold text-white">{quota == null ? `${usageCount ?? 0} / -` : `${usageCount ?? 0} / ${quota}`}</p>
                <p className="text-xs text-gray-400">Usage status</p>
              </div>
            </div>
            <div className="h-3 bg-[#1e2532] rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-[#00FF94] to-[#00A3FF]"
                initial={{ width: 0 }}
                animate={{ width: `${usagePct}%` }}
                transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
              />
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-xs text-gray-500">0</span>
              <span className="text-xs text-gray-500">{quota == null ? '-' : `${quota} scans`}</span>
            </div>
          </div>

          <div className="mt-4">
            <h3 className="text-sm font-semibold text-white mb-2">Recent scans</h3>
            {scans.length === 0 ? (
              <div className="text-xs text-gray-500">No recent scans available.</div>
            ) : (
              <div className="space-y-2">
                {scans.map((s, index) => (
                  // Fixed warning unique loop tracking key identifier mapping fallback sequence
                  <div key={s.id || s._id || index} className="flex items-center justify-between bg-[#071019] p-2 rounded border border-[#0f1720]">
                    <div className="text-xs text-gray-300">{s.host || s.url}</div>
                    <div className="text-xs text-gray-500">{new Date(s.scannedAt).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-semibold text-white mb-2">Admin: All API keys</h3>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setActiveDialog({ kind: "showKeys" })}
                className="px-3 py-2 rounded bg-[#151921] border border-[#1e2532] text-sm text-white"
              >
                Show keys
              </button>
              <button
                onClick={() => setActiveDialog({ kind: "setAllQuota" })}
                className="px-3 py-2 rounded bg-[#003744] border border-[#0b3942] text-sm text-[#00FF94]"
              >
                Set All to 5
              </button>
              <button
                onClick={() => setAdminKeys(null)}
                className="px-3 py-2 rounded bg-[#0B0E14] border border-[#1e2532] text-sm text-gray-400"
              >
                Hide
              </button>
            </div>

            {adminKeys == null ? (
              <div className="text-xs text-gray-500">Admin view hidden.</div>
            ) : (
              <div className="space-y-2">
                {adminKeys.map((k, index) => (
                  // Fixed warning unique loop tracking key identifier mapping fallback sequence
                  <div key={k.id || k._id || index} className="flex items-center justify-between bg-[#071019] p-2 rounded border border-[#0f1720]">
                    <div className="text-xs text-gray-300">{k.name} (#{k.id})</div>
                    <div className="flex items-center gap-3">
                      <div className="text-xs text-gray-400">Used: {k.usage_count ?? 0}</div>
                      <div className="text-xs text-gray-400">Quota: {k.quota == null ? '-' : k.quota}</div>
                      <button
                        onClick={() => setActiveDialog({ kind: "setSingleQuota", adminKey: k })}
                        className="px-2 py-1 rounded bg-[#00A3FF]/10 text-xs text-[#00A3FF] border border-[#00A3FF]/20"
                      >
                        Set 5
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </BentoCard>

      {dialogMeta && (
        <ActionDialog
          open={activeDialog != null}
          onOpenChange={(open) => {
            if (!open) setActiveDialog(null);
          }}
          title={dialogMeta.title}
          description={dialogMeta.description}
          confirmLabel={dialogMeta.confirmLabel}
          destructive={dialogMeta.destructive}
          fields={dialogFields()}
          onConfirm={submitDialog}
        />
      )}

      <BentoCard>
        <div className="flex flex-col lg:flex-row items-start justify-between gap-6">
          <div className="flex-1 w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-[#00A3FF]/20 flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-[#00A3FF]"></div>
              </div>
              <div>
                <h3 className="text-base md:text-lg font-bold text-white">Current plan</h3>
                <p className="text-xs md:text-sm text-gray-400">Basic Tier</p>
              </div>
            </div>
            <div className="space-y-2 mb-6">
              <div className="flex items-center gap-2 text-xs md:text-sm text-gray-300">
                <CheckCircle2 className="w-4 h-4 text-[#00A3FF] flex-shrink-0" />
                <span>5 scans per month</span>
              </div>
              <div className="flex items-center gap-2 text-xs md:text-sm text-gray-300">
                <CheckCircle2 className="w-4 h-4 text-[#00A3FF] flex-shrink-0" />
                <span>Basic vulnerability detection</span>
              </div>
              <div className="flex items-center gap-2 text-xs md:text-sm text-gray-300">
                <CheckCircle2 className="w-4 h-4 text-[#00A3FF] flex-shrink-0" />
                <span>Standard support</span>
              </div>
            </div>
            <button onClick={() => setActiveDialog({ kind: "upgrade" })} className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-[#00FF94] to-[#00A3FF] text-[#0B0E14] font-bold rounded-lg hover:shadow-lg hover:shadow-[#00FF94]/30 transition-all text-sm md:text-base">
              Upgrade to Research Tier
            </button>
          </div>
        </div>
      </BentoCard>
    </div>
  );
}