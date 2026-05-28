import { LayoutDashboard, History, Settings, Star } from "lucide-react";
import { Link, useLocation } from "react-router";

const navigation = [
  { name: "Dashboard", icon: LayoutDashboard, path: "/" },
  { name: "Scan History", icon: History, path: "/history" },
  { name: "API Settings", icon: Settings, path: "/api-settings" },
  { name: "Research Tier", icon: Star, path: "/research" },
];

interface SidebarProps {
  onNavigate?: () => void;
}

export default function Sidebar({ onNavigate }: SidebarProps) {
  const location = useLocation();

  return (
    <div className="w-64 h-screen bg-[#0B0E14] border-r border-[#1e2532] flex flex-col">
      <div className="p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#00FF94] to-[#00A3FF] flex items-center justify-center">
            <span className="text-xl font-bold text-[#0B0E14]">PQC</span>
          </div>
          <div>
            <h1 className="font-bold text-white">QuantumShield</h1>
            <p className="text-xs text-gray-400">Security Auditor</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {navigation.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.name}
              to={item.path}
              onClick={onNavigate}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                isActive
                  ? "bg-[#151921] text-[#00FF94] border border-[#00FF94]/20"
                  : "text-gray-400 hover:bg-[#151921]/50 hover:text-white"
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-[#1e2532]">
        <div className="bg-[#151921] rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-[#00A3FF]"></div>
            <span className="text-sm text-white">Basic Tier</span>
          </div>
          <p className="text-xs text-gray-400">
            Upgrade to Research for unlimited scans
          </p>
        </div>
      </div>
    </div>
  );
}