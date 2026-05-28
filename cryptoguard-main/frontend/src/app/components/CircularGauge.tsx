import { motion } from "motion/react";
import { useEffect, useState } from "react";

interface CircularGaugeProps {
  percentage?: number;
  label: string;
  color: string;
}

export default function CircularGauge({ percentage, label, color }: CircularGaugeProps) {
  const [displayPercentage, setDisplayPercentage] = useState<number | null>(0);
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const pct = typeof displayPercentage === 'number' ? Math.max(0, Math.min(100, displayPercentage)) : 0;
  const strokeDashoffset = circumference - (pct / 100) * circumference;

  useEffect(() => {
    if (typeof percentage !== 'number' || !Number.isFinite(percentage)) {
      setDisplayPercentage(null);
      return;
    }
    const timer = setTimeout(() => setDisplayPercentage(percentage), 100);
    return () => clearTimeout(timer);
  }, [percentage]);

  return (
    <div className="flex flex-col items-center gap-3 md:gap-4">
      <div className="relative w-32 h-32 sm:w-36 sm:h-36 md:w-40 md:h-40">
        <svg className="transform -rotate-90 w-32 h-32 sm:w-36 sm:h-36 md:w-40 md:h-40" viewBox="0 0 160 160">
          {/* Background circle */}
          <circle
            cx="80"
            cy="80"
            r={radius}
            stroke="#1e2532"
            strokeWidth="12"
            fill="none"
          />
          {/* Progress circle */}
          <motion.circle
            cx="80"
            cy="80"
            r={radius}
            stroke={color}
            strokeWidth="12"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 0.8, ease: "easeInOut", delay: 0.2 }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.span
            className="text-2xl sm:text-3xl font-bold"
            style={{ color }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            {typeof displayPercentage === 'number' && Number.isFinite(displayPercentage)
              ? `${Math.round(displayPercentage)}%`
              : 'N/A'}
          </motion.span>
        </div>
      </div>
      <span className="text-xs sm:text-sm text-gray-400 text-center">{label}</span>
    </div>
  );
}