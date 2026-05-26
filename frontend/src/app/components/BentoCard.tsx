import { motion } from "motion/react";
import { ReactNode } from "react";

interface BentoCardProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

export default function BentoCard({ children, className = "", delay = 0 }: BentoCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
      whileHover={{ 
        y: -1,
        boxShadow: "0 0 20px rgba(0, 163, 255, 0.3)",
        borderColor: "rgba(0, 163, 255, 0.5)"
      }}
      className={`bg-[#151921] border border-[#1e2532] rounded-xl p-4 md:p-6 transition-all duration-200 ${className}`}
    >
      {children}
    </motion.div>
  );
}