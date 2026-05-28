import BentoCard from "../components/BentoCard";
import { CheckCircle2, ShieldCheck, Route, Zap } from "lucide-react";

const steps = [
  {
    title: "Hybrid TLS rollout",
    body: "Move from classical key exchange to hybrid TLS with ML-KEM + X25519 during the transition window.",
    icon: ShieldCheck,
  },
  {
    title: "Certificate inventory",
    body: "Track issuer, key size, signature algorithm, and expiry so vulnerable assets are easy to prioritize.",
    icon: Route,
  },
  {
    title: "Automation layer",
    body: "Schedule audits, alert on CRITICAL risk, and export findings into a change-management workflow.",
    icon: Zap,
  },
];

export default function Research() {
  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">Research Tier</h1>
        <p className="text-sm md:text-base text-gray-400">
          Planning view for the next-stage PQC workflow and migration strategy.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <BentoCard key={step.title}>
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <p className="text-xs text-gray-400 mb-1">Roadmap</p>
                  <h3 className="text-lg font-bold text-white">{step.title}</h3>
                </div>
                <div className="w-10 h-10 rounded-lg bg-[#00A3FF]/20 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-[#00A3FF]" />
                </div>
              </div>
              <p className="text-sm text-gray-300">{step.body}</p>
            </BentoCard>
          );
        })}
      </div>

      <BentoCard>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-xs text-gray-400 mb-1">Priority outcome</p>
            <h3 className="text-lg font-bold text-white">Production readiness checklist</h3>
          </div>
          <CheckCircle2 className="w-6 h-6 text-[#00FF94]" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-300">
          <div className="bg-[#0B0E14] border border-[#1e2532] rounded-lg p-4">Connect scan results to ticketing or chat alerts.</div>
          <div className="bg-[#0B0E14] border border-[#1e2532] rounded-lg p-4">Add scheduled scans for high-value domains.</div>
          <div className="bg-[#0B0E14] border border-[#1e2532] rounded-lg p-4">Store remediation status alongside each audit.</div>
          <div className="bg-[#0B0E14] border border-[#1e2532] rounded-lg p-4">Export compliance summaries for security reviews.</div>
        </div>
      </BentoCard>
    </div>
  );
}