import CryptoJS from 'crypto-js';

/**
 * Calculate SHA-256 hash of a file
 * @param {File} file - The file to hash
 * @returns {Promise<string>} - The SHA-256 hash
 */
export const calculateFileHash = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      const arrayBuffer = event.target.result;
      const wordArray = CryptoJS.lib.WordArray.create(arrayBuffer);
      const hash = CryptoJS.SHA256(wordArray).toString();
      resolve(hash);
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsArrayBuffer(file);
  });
};

/**
 * Format hash for display
 * @param {string} hash - Full hash string
 * @returns {string} - Formatted hash (first 16 chars + ... + last 8 chars)
 */
export const formatHash = (hash) => {
  if (!hash || hash.length < 24) return hash;
  return `${hash.substring(0, 16)}...${hash.substring(hash.length - 8)}`;
};

/**
 * Copy hash to clipboard
 * @param {string} hash - The hash to copy
 */
export const copyToClipboard = async (hash) => {
  try {
    await navigator.clipboard.writeText(hash);
    return true;
  } catch (err) {
    console.error('Failed to copy:', err);
    return false;
  }
};

/**
 * Validate hash format
 * @param {string} hash - The hash to validate
 * @returns {boolean} - True if valid SHA-256 hash
 */
export const isValidHash = (hash) => {
  return /^[a-f0-9]{64}$/.test(hash);
};
