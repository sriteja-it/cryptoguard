import { motion } from "motion/react";

export default function SkeletonCard() {
  return (
    <div className="bg-[#151921] border border-[#1e2532] rounded-xl p-6">
      <motion.div
        className="space-y-4"
        initial={{ opacity: 0.5 }}
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="h-4 bg-[#1e2532] rounded w-3/4"></div>
        <div className="h-8 bg-[#1e2532] rounded w-1/2"></div>
        <div className="h-3 bg-[#1e2532] rounded w-full"></div>
      </motion.div>
    </div>
  );
}
