/**
 * Application configuration loaded from environment variables
 */

const API_KEY_STORAGE_KEY = "pqc_dashboard_api_key";
const LEGACY_API_KEY_STORAGE_KEY = "pqc_api_key_override";
const API_BASE_URL_STORAGE_KEY = "pqc_dashboard_api_base_url";
const DEFAULT_API_BASE_URL = "http://localhost:4000";

const normalizeApiBaseUrl = (url: string): string => {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed) return DEFAULT_API_BASE_URL;
  if (trimmed === "http://localhost:4004") return DEFAULT_API_BASE_URL;
  return trimmed;
};

const getStoredValue = (key: string): string | null => {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(key);
};

const setStoredValue = (key: string, value: string) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, value);
};

const removeStoredValue = (key: string) => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key);
};

const notifyConfigChanged = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("pqc:config-changed"));
};

export const getApiKey = (): string =>
  getStoredValue(API_KEY_STORAGE_KEY) || getStoredValue(LEGACY_API_KEY_STORAGE_KEY) || import.meta.env.VITE_API_KEY || "";

export const setApiKeyOverride = (apiKey: string) => {
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

export const setApiBaseUrlOverride = (url: string) => {
  setStoredValue(API_BASE_URL_STORAGE_KEY, normalizeApiBaseUrl(url));
  notifyConfigChanged();
};

export const clearApiBaseUrlOverride = () => {
  removeStoredValue(API_BASE_URL_STORAGE_KEY);
  notifyConfigChanged();
};

export const config = {
  get apiKey() {
    return getApiKey();
  },
  get apiBaseUrl() {
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
