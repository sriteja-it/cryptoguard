import { Search, User, KeyRound, Copy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { config, getMaskedApiKey } from "../../utils/config";

export default function TopBar() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [apiKey, setApiKey] = useState(config.apiKey);

  useEffect(() => {
    const syncKey = () => setApiKey(config.apiKey);
    syncKey();
    window.addEventListener("storage", syncKey);
    window.addEventListener("pqc:config-changed", syncKey as EventListener);
    return () => {
      window.removeEventListener("storage", syncKey);
      window.removeEventListener("pqc:config-changed", syncKey as EventListener);
    };
  }, []);

  const maskedKey = useMemo(() => getMaskedApiKey(apiKey), [apiKey]);

  const submitSearch = (q: string) => {
    if (!q || q.trim() === "") return;
    navigate(`/history?q=${encodeURIComponent(q.trim())}`);
  };

  const copyKey = async () => {
    if (!apiKey) return;
    try {
      await navigator.clipboard.writeText(apiKey);
    } catch {
      // ignore clipboard failures in the header
    }
  };

  return (
    <div className="bg-[#0B0E14] border-b border-[#1e2532] px-4 lg:px-6 py-3">
      <div className="flex flex-col gap-3 lg:hidden">
        <div className="flex flex-col gap-2 mt-12">
          <div className="flex items-center justify-end gap-3 flex-wrap">
            <button
              type="button"
              onClick={copyKey}
              className="inline-flex items-center gap-2 rounded-full border border-[#1e2532] bg-[#151921] px-3 py-2 text-xs text-gray-300"
            >
              <KeyRound className="w-3.5 h-3.5 text-[#00A3FF]" />
              <span className="font-mono">{maskedKey}</span>
              <Copy className="w-3.5 h-3.5 text-gray-400" />
            </button>
            <div className="flex items-center justify-end gap-3">
              <div className="text-right">
                <div className="text-sm font-medium text-white">Lead Architect</div>
                <div className="text-xs text-gray-400">Basic Tier</div>
              </div>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#00FF94] to-[#00A3FF] flex items-center justify-center flex-shrink-0">
                <User className="w-5 h-5 text-[#0B0E14]" />
              </div>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitSearch(query);
              }}
              placeholder="Search URLs, domains, or certificates..."
              className="w-full bg-[#151921] border border-[#1e2532] rounded-lg pl-11 pr-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-[#00A3FF] transition-colors text-sm"
            />
          </div>
        </div>
      </div>

      <div className="hidden lg:flex items-center justify-between gap-6">
        <div className="flex-1 max-w-2xl">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitSearch(query);
              }}
              placeholder="Search URLs, domains, or certificates..."
              className="w-full bg-[#151921] border border-[#1e2532] rounded-lg pl-11 pr-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-[#00A3FF] transition-colors text-sm"
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={copyKey}
            className="inline-flex items-center gap-2 rounded-full border border-[#1e2532] bg-[#151921] px-4 py-2 text-xs text-gray-300 hover:border-[#00A3FF] transition-colors"
          >
            <KeyRound className="w-3.5 h-3.5 text-[#00A3FF]" />
            <span className="font-mono tracking-wide">{maskedKey}</span>
            <Copy className="w-3.5 h-3.5 text-gray-400" />
          </button>
          <div className="text-right">
            <div className="text-sm font-medium text-white">Lead Architect</div>
            <div className="text-xs text-gray-400">Basic Tier</div>
          </div>
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#00FF94] to-[#00A3FF] flex items-center justify-center flex-shrink-0">
            <User className="w-5 h-5 text-[#0B0E14]" />
          </div>
        </div>
      </div>
    </div>
  );
}