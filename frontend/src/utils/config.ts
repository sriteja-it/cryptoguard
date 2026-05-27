/**
 * Application configuration loaded from environment variables
 */

interface ImportMetaEnv {
  readonly VITE_API_KEY?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_ADMIN_TOKEN?: string; // Added for secure build compilation tracking
}

declare global {
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}
//https://cryptoguard-9exr.onrender.com

const API_KEY_STORAGE_KEY = "pqc_dashboard_api_key";
const LEGACY_API_KEY_STORAGE_KEY = "pqc_api_key_override";
const API_BASE_URL_STORAGE_KEY = "pqc_dashboard_api_base_url";
const DEFAULT_API_BASE_URL = "https://cryptoguard-9exr.onrender.com";

const normalizeApiBaseUrl = (url: string): string => {
  const trimmed = url.trim().replace(/\/+$/, "");
  // If empty or matches standard production URL, return the fallback standard base
  if (!trimmed || trimmed === DEFAULT_API_BASE_URL) {
    return DEFAULT_API_BASE_URL;
  }
  return trimmed;
};

const getStoredValue = (key: string): string | null => {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(key);
};

const setStoredValue = (key: string, value: string): void => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, value);
};

const removeStoredValue = (key: string): void => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key);
};

const notifyConfigChanged = (): void => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("pqc:config-changed"));
};

export const getApiKey = (): string =>
  getStoredValue(API_KEY_STORAGE_KEY) || getStoredValue(LEGACY_API_KEY_STORAGE_KEY) || import.meta.env.VITE_API_KEY || "";

export const setApiKeyOverride = (apiKey: string): void => {
  setStoredValue(API_KEY_STORAGE_KEY, apiKey);
  setStoredValue(LEGACY_API_KEY_STORAGE_KEY, apiKey);
  notifyConfigChanged();
};

export const clearApiKeyOverride = () => {
  removeStoredValue(API_KEY_STORAGE_KEY);
  removeStoredValue(LEGACY_API_KEY_STORAGE_KEY);
  notifyConfigChanged();
};

export const getApiBaseUrl = (): string =>
  normalizeApiBaseUrl(getStoredValue(API_BASE_URL_STORAGE_KEY) || import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL);

export const setApiBaseUrlOverride = (url: string): void => {
  setStoredValue(API_BASE_URL_STORAGE_KEY, normalizeApiBaseUrl(url));
  notifyConfigChanged();
};

export const clearApiBaseUrlOverride = (): void => {
  removeStoredValue(API_BASE_URL_STORAGE_KEY);
  notifyConfigChanged();
};

// ─── ALIASES TO RECTIFY UI REFERENCE ERRORS ──────────────────────────────────
// Added explicit type maps to ensure UI imports compile flawlessly on production systems
export const setApiBaseOverride: (url: string) => void = setApiBaseUrlOverride;
export const clearApiBaseOverride: () => void = clearApiBaseUrlOverride;

export const config = {
  get apiKey(): string {
    return getApiKey();
  },
  get apiBaseUrl(): string {
    return getApiBaseUrl();
  },
};

export default config;

/**
 * Gets the masked version of API key for display
 */
export const getMaskedApiKey = (apiKey: string): string => {
  if (!apiKey) return 'No key loaded';
  if (apiKey.length < 8) return '••••••••';
  const visiblePart = apiKey.substring(0, 8);
  const hiddenPart = '•'.repeat(apiKey.length - 8);
  return `${visiblePart}${hiddenPart}`;
};