import { Link } from "react-router";
import { AlertTriangle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex items-center justify-center h-full bg-[#0B0E14]">
      <div className="text-center">
        <AlertTriangle className="w-16 h-16 text-[#FF4D4D] mx-auto mb-4" />
        <h1 className="text-4xl font-bold text-white mb-2">404</h1>
        <p className="text-gray-400 mb-6">Page not found</p>
        <Link
          to="/"
          className="px-6 py-3 bg-gradient-to-r from-[#00FF94] to-[#00A3FF] text-[#0B0E14] font-bold rounded-lg hover:shadow-lg transition-all inline-block"
        >
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
