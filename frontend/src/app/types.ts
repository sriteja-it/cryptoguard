export type ScanItem = {
  id: number;
  url: string;
  scannedAt: string;
  analysis?: {
    riskLevel?: string;
    reasons?: string[];
    recommendations?: string[];
  };
  certInfo?: {
    publicKeyType?: string;
    publicKeySize?: number;
    tlsVersion?: string;
    serialNumber?: string;
    signatureAlgorithm?: string;
    subject?: Record<string, string>;
    issuer?: Record<string, string>;
  };
};