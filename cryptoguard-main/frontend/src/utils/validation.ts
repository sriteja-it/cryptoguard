/**
 * Validates if a string is a valid URL
 */
export const isValidUrl = (str: string): boolean => {
  try {
    // Remove protocol if not present for validation
    const urlString = str.startsWith('http') ? str : `https://${str}`;
    new URL(urlString);
    return true;
  } catch {
    return false;
  }
};

/**
 * Formats a URL for API requests
 */
export const formatUrlForApi = (url: string): string => {
  if (url.startsWith('http')) {
    return url;
  }
  return `https://${url}`;
};

/**
 * Extracts domain from URL
 */
export const extractDomain = (url: string): string => {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    return urlObj.hostname;
  } catch {
    return url;
  }
};
