import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const BASE64_CHUNK_SIZE = 0x8000;

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Sign a file - submit for processing
 */
export const signFile = async (fileHash, _fileBytes, metadata, aiAnalysis) => {
  try {
    const response = await api.post('/api/sign', {
      hash: fileHash,
      metadata,
      aiAnalysis,
    });
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.message || 'Failed to sign file');
  }
};

/**
 * Verify a file against the database
 */
export const verifyFile = async (fileHash, metadata = {}, aiAnalysis = null) => {
  try {
    const response = await api.post('/api/verify', {
      hash: fileHash,
      metadata,
      aiAnalysis,
    });
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.message || 'Verification failed');
  }
};

/**
 * Get AI analysis (Vertex AI)
 */
export const analyzeFileWithAI = async (fileHash, filePayload, metadata) => {
  try {
    let fileBytesBase64 = null;
    let fileMimeType = metadata?.fileType || '';

    const resolvedBytes = filePayload?.bytes || filePayload || null;
    if (filePayload?.mimeType) {
      fileMimeType = filePayload.mimeType;
    }

    if (resolvedBytes?.length) {
      let binary = '';
      for (let i = 0; i < resolvedBytes.length; i += BASE64_CHUNK_SIZE) {
        const chunk = resolvedBytes.subarray(i, i + BASE64_CHUNK_SIZE);
        binary += String.fromCharCode(...chunk);
      }
      fileBytesBase64 = btoa(binary);
    }

    const response = await api.post('/api/analyze', {
      hash: fileHash,
      metadata,
      fileBytesBase64,
      fileMimeType,
    });
    return response.data;
  } catch (error) {
    if (error.response?.status === 429) {
      throw new Error('Gemini API rate limit reached. Please wait a moment and try again.');
    }
    throw new Error(error.response?.data?.message || 'AI analysis failed');
  }
};

/**
 * Generate provenance metadata with Gemini
 */
export const generateProvenance = async (fileHash, metadata) => {
  try {
    const response = await api.post('/api/provenance', {
      hash: fileHash,
      metadata,
    });
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.message || 'Failed to generate provenance');
  }
};

/**
 * Get all signed assets (mock endpoint for now)
 */
export const getSignedAssets = async () => {
  try {
    const response = await api.get('/api/assets');
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.message || 'Failed to fetch assets');
  }
};

/**
 * Get asset details by hash
 */
export const getAssetDetails = async (hash) => {
  try {
    const response = await api.get(`/api/assets/${hash}`);
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.message || 'Failed to fetch asset details');
  }
};

export const getMonitoringFeed = async () => {
  try {
    const response = await api.get('/api/monitoring');
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.message || 'Failed to fetch monitoring feed');
  }
};

export const deleteAssets = async (hashes = []) => {
  try {
    const response = await api.post('/api/assets/delete', { hashes });
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.message || 'Failed to delete selected files');
  }
};

export default api;
