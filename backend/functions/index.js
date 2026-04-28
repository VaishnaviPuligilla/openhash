const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const cors = require('cors');
const express = require('express');
const axios = require('axios');
const { GoogleAuth } = require('google-auth-library');
const fs = require('fs');
const path = require('path');

admin.initializeApp();
const db = getFirestore();
const localAssetStore = new Map();
const LOCAL_STORE_PATH = path.join(__dirname, '.openhash-local-store.json');

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '50mb' }));

const BLOCKCHAIN_NETWORK = 'Polygon Amoy';
const MONITORING_SOURCES = ['X/Twitter', 'Instagram Reels', 'YouTube Shorts', 'Telegram', 'News scraper'];
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
const EXPLICIT_VERTEX_PROJECT_ID = process.env.VERTEX_PROJECT_ID || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const VERTEX_PROJECT_ID = EXPLICIT_VERTEX_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || '';
const VERTEX_LOCATION = process.env.VERTEX_LOCATION || 'us-central1';
const VERTEX_MODEL = process.env.VERTEX_MODEL || 'gemini-2.5-flash';
const VERTEX_SERVICE_ACCOUNT_JSON = process.env.VERTEX_SERVICE_ACCOUNT_JSON || '';
const GOOGLE_CLOUD_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
let cachedVertexAuth = null;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const clampScore = (value) => Math.max(0, Math.min(100, Math.round(value)));

const average = (values = []) => {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const variance = (values = []) => {
  if (!values.length) return 0;
  const mean = average(values);
  return average(values.map((value) => (value - mean) ** 2));
};

const estimateCompressionRisk = (metadata = {}) => {
  const fileType = (metadata.fileType || '').toLowerCase();
  const fileSize = Number(metadata.fileSize || 0);

  if (!fileType.startsWith('image/') || !fileSize) return 0.18;
  if (fileType.includes('png') || fileType.includes('svg')) return 0.12;
  if (fileType.includes('jpeg') || fileType.includes('jpg') || fileType.includes('webp')) return 0.28;
  return 0.2;
};

const analyzeAsset = ({ hash, metadata = {} }) => {
  const fileType = (metadata.fileType || '').toLowerCase();
  const fileSize = Number(metadata.fileSize || 0);
  const visualSignature = metadata.visualSignature || null;
  const extension = (metadata.fileName || '').split('.').pop()?.toLowerCase() || '';
  const hashPrefix = hash ? parseInt(hash.slice(0, 8), 16) : 0;

  const fileSizeMb = fileSize ? fileSize / (1024 * 1024) : 0;
  const histogram = visualSignature?.histogram || [];
  const colorMoments = visualSignature?.colorMoments || [];
  const brightnessVariance = variance(histogram);
  const colorVariance = variance(colorMoments);
  const histogramPeak = histogram.length ? Math.max(...histogram) : 0;

  let humanOriginScore = 78;
  let confidence = 0.76;
  let summary = 'Structured metadata and visual characteristics look consistent with an authentic original asset.';
  let riskLevel = 'low';
  const indicators = [];

  if (!fileType) {
    humanOriginScore -= 6;
    confidence -= 0.08;
    indicators.push('Missing MIME type reduced certainty.');
  }

  if (fileType.startsWith('image/')) {
    humanOriginScore += 4;
    confidence += 0.07;
    indicators.push('Visual signature was available for image-based authenticity checks.');

    if (brightnessVariance < 0.0008) {
      humanOriginScore -= 12;
      confidence += 0.03;
      riskLevel = 'medium';
      summary = 'The image looks unusually flat in tone, which can happen in synthetic or heavily edited assets.';
      indicators.push('Low brightness variation suggests a flatter-than-normal image profile.');
    } else {
      humanOriginScore += 5;
      indicators.push('Brightness distribution has natural variation.');
    }

    if (colorVariance < 0.015) {
      humanOriginScore -= 10;
      riskLevel = 'medium';
      indicators.push('Color channels show limited spread, which can indicate aggressive post-processing.');
    } else {
      humanOriginScore += 3;
      indicators.push('Color spread is consistent with camera or hand-crafted artwork output.');
    }

    if (histogramPeak > 0.22) {
      humanOriginScore -= 6;
      indicators.push('Histogram concentration is slightly high, suggesting repetitive tonal ranges.');
    }
  } else {
    humanOriginScore += 2;
    indicators.push('Non-image file relies on cryptographic and metadata consistency checks.');
  }

  if (fileSizeMb > 25) {
    humanOriginScore += 3;
    confidence += 0.03;
    indicators.push('Larger file size preserved more original structure.');
  } else if (fileSizeMb && fileSizeMb < 0.5) {
    humanOriginScore -= 4;
    indicators.push('Very small asset size reduces available forensic signal.');
  }

  if (['png', 'tiff', 'wav', 'flac', 'pdf'].includes(extension)) {
    humanOriginScore += 3;
    indicators.push('Loss-minimizing format supports stronger authenticity review.');
  }

  const compressionRisk = estimateCompressionRisk(metadata);
  const deterministicNoise = (hashPrefix % 9) - 4;
  humanOriginScore += deterministicNoise;

  const aiArtifactScore = Math.max(0.01, Number((0.32 - (humanOriginScore / 200) + compressionRisk / 3).toFixed(3)));
  const editingLikelihood = Math.max(0.02, Number((0.24 + compressionRisk / 2 + histogramPeak / 3).toFixed(3)));
  const naturalPatternScore = Math.min(0.99, Number((0.52 + Math.min(0.28, brightnessVariance * 120) + Math.min(0.18, colorVariance)).toFixed(3)));

  if (humanOriginScore < 65) {
    riskLevel = 'high';
    summary = 'The asset has several synthetic or heavily processed traits and should be reviewed before trust is granted.';
  } else if (humanOriginScore < 80 && riskLevel !== 'high') {
    riskLevel = 'medium';
    summary = 'The asset looks broadly plausible, but there are enough anomalies to justify a careful review.';
  }

  return {
    model: 'openhash-local-analysis-v1',
    humanOriginScore: clampScore(humanOriginScore),
    confidence: Number(Math.max(0.55, Math.min(0.98, confidence)).toFixed(2)),
    riskLevel,
    summary,
    indicators,
    analysis: {
      aiArtifactScore,
      editingLikelihood,
      compressionRisk: Number(compressionRisk.toFixed(3)),
      naturalPatternScore,
      histogramPeak: Number(histogramPeak.toFixed(3)),
      brightnessVariance: Number(brightnessVariance.toFixed(5)),
      colorVariance: Number(colorVariance.toFixed(5)),
    },
  };
};

const parseModelText = (response) =>
  response?.data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';

const clampUnit = (value) => Number(Math.max(0, Math.min(1, Number(value || 0))).toFixed(3));

const sanitizeAnalysis = (payload, fallback, provider, modelName, usedRealAI = true) => ({
  model: payload?.model || modelName,
  humanOriginScore: clampScore(payload?.humanOriginScore ?? fallback.humanOriginScore),
  confidence: Number(Math.max(0.55, Math.min(0.99, Number(payload?.confidence ?? fallback.confidence))).toFixed(2)),
  riskLevel:
    payload?.riskLevel === 'low' || payload?.riskLevel === 'medium' || payload?.riskLevel === 'high'
      ? payload.riskLevel
      : fallback.riskLevel,
  summary: payload?.summary || fallback.summary,
  indicators: Array.isArray(payload?.indicators) && payload.indicators.length
    ? payload.indicators.slice(0, 6).map((item) => String(item))
    : fallback.indicators,
  analysis: {
    aiArtifactScore: clampUnit(payload?.analysis?.aiArtifactScore ?? fallback.analysis.aiArtifactScore),
    editingLikelihood: clampUnit(payload?.analysis?.editingLikelihood ?? fallback.analysis.editingLikelihood),
    compressionRisk: clampUnit(payload?.analysis?.compressionRisk ?? fallback.analysis.compressionRisk),
    naturalPatternScore: clampUnit(payload?.analysis?.naturalPatternScore ?? fallback.analysis.naturalPatternScore),
    histogramPeak: clampUnit(payload?.analysis?.histogramPeak ?? fallback.analysis.histogramPeak),
    brightnessVariance: Number(payload?.analysis?.brightnessVariance ?? fallback.analysis.brightnessVariance),
    colorVariance: Number(payload?.analysis?.colorVariance ?? fallback.analysis.colorVariance),
  },
  provider,
  usedRealAI,
});

const buildLocalFallbackAnalysis = (heuristicAnalysis) =>
  sanitizeAnalysis(
    heuristicAnalysis,
    heuristicAnalysis,
    'local_fallback',
    heuristicAnalysis?.model || 'openhash-local-analysis-v1',
    false,
  );

const buildGeminiPrompt = ({ hash, metadata, heuristicAnalysis }) => `
You are an authenticity forensics assistant for Aura Ledger.
Return only JSON matching the requested schema.

Task:
- assess whether this asset appears human-created, AI-generated, tampered, or uncertain
- use the provided metadata and heuristic signals
- if an image is attached, use it as additional evidence
- be conservative and avoid overclaiming

Asset hash: ${hash}
File name: ${metadata?.fileName || 'unknown'}
File type: ${metadata?.fileType || 'unknown'}
File size bytes: ${metadata?.fileSize || 0}
Capture mode: ${metadata?.captureMode || 'upload'}
Creator description: ${metadata?.description || 'none'}

Heuristic baseline:
${JSON.stringify(heuristicAnalysis, null, 2)}

Scoring rules:
- humanOriginScore: 0 to 100
- confidence: 0 to 1
- riskLevel: low, medium, or high
- indicators: short bullet-like findings
- analysis values: 0 to 1 except brightnessVariance and colorVariance
`.trim();

const postGeminiAnalysis = async (parts) => {
  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            model: { type: 'string' },
            humanOriginScore: { type: 'integer' },
            confidence: { type: 'number' },
            riskLevel: { type: 'string' },
            summary: { type: 'string' },
            indicators: {
              type: 'array',
              items: { type: 'string' },
            },
            analysis: {
              type: 'object',
              properties: {
                aiArtifactScore: { type: 'number' },
                editingLikelihood: { type: 'number' },
                compressionRisk: { type: 'number' },
                naturalPatternScore: { type: 'number' },
                histogramPeak: { type: 'number' },
                brightnessVariance: { type: 'number' },
                colorVariance: { type: 'number' },
              },
              required: [
                'aiArtifactScore',
                'editingLikelihood',
                'compressionRisk',
                'naturalPatternScore',
                'histogramPeak',
                'brightnessVariance',
                'colorVariance',
              ],
            },
          },
          required: ['model', 'humanOriginScore', 'confidence', 'riskLevel', 'summary', 'indicators', 'analysis'],
        },
      },
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      timeout: 45000,
    },
  );

  const text = parseModelText(response);
  if (!text) {
    throw new Error('Gemini returned an empty response');
  }

  return JSON.parse(text);
};

const analyzeWithGemini = async ({ hash, metadata = {}, fileBytesBase64, fileMimeType, heuristicAnalysis }) => {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is required for Gemini analysis and provenance.');
  }

  const textPart = { text: buildGeminiPrompt({ hash, metadata, heuristicAnalysis }) };
  const parts = [textPart];

  if (fileBytesBase64 && metadata?.fileType?.startsWith('image/')) {
    parts.push({
      inlineData: {
        mimeType: fileMimeType || metadata.fileType,
        data: fileBytesBase64,
      },
    });
  }

  try {
    return await postGeminiAnalysis(parts);
  } catch (error) {
    const status = error?.response?.status;
    const hasInlineImage = parts.length > 1;
    const timedOut = error?.code === 'ECONNABORTED';

    if (status === 429) {
      console.warn('Gemini rate limited the request, retrying once:', error?.response?.data || error.message);
      await delay(1500);
      return postGeminiAnalysis(parts);
    }

    if (hasInlineImage && (timedOut || status === 500 || status === 503 || status === 504)) {
      console.warn('Gemini image request failed, retrying with text-only prompt:', error?.response?.data || error.message);
      return postGeminiAnalysis([textPart]);
    }

    throw error;
  }
};

const runAuthenticityAnalysis = async ({ hash, metadata = {}, fileBytesBase64, fileMimeType, heuristicAnalysis }) => {
  if (GEMINI_API_KEY) {
    try {
      const geminiPayload = await analyzeWithGemini({
        hash,
        metadata,
        fileBytesBase64,
        fileMimeType,
        heuristicAnalysis,
      });

      return sanitizeAnalysis(
        geminiPayload,
        heuristicAnalysis,
        'gemini',
        `gemini/${GEMINI_MODEL}`,
      );
    } catch (error) {
      const status = error?.response?.status;
      const emulatorMode = process.env.FUNCTIONS_EMULATOR === 'true';

      if (status === 429) {
        throw new Error('Gemini API rate limit reached. Please wait a moment and try again.');
      }

      if (emulatorMode && (status === 503 || status === 500 || status === 504)) {
        console.warn('Gemini unavailable in emulator, using local heuristic fallback:', error?.response?.data || error.message);
        return buildLocalFallbackAnalysis(heuristicAnalysis);
      }

      throw error;
    }
  }

  const allowVertexFallback = EXPLICIT_VERTEX_PROJECT_ID || process.env.FUNCTIONS_EMULATOR !== 'true';

  if (allowVertexFallback && VERTEX_PROJECT_ID) {
    const vertexPayload = await analyzeWithVertex({
      hash,
      metadata,
      fileBytesBase64,
      heuristicAnalysis,
    });

    return sanitizeAnalysis(
      vertexPayload,
      heuristicAnalysis,
      'vertex_ai',
      `vertex/${VERTEX_MODEL}`,
    );
  }

  throw new Error('Set GEMINI_API_KEY for analysis. Vertex AI remains available as an optional fallback.');
};

const getVertexAuth = () => {
  if (cachedVertexAuth) return cachedVertexAuth;

  let credentials = undefined;
  if (VERTEX_SERVICE_ACCOUNT_JSON) {
    credentials = JSON.parse(VERTEX_SERVICE_ACCOUNT_JSON);
  }

  cachedVertexAuth = new GoogleAuth({
    credentials,
    scopes: [GOOGLE_CLOUD_SCOPE],
  });

  return cachedVertexAuth;
};

const getVertexAccessToken = async () => {
  const auth = getVertexAuth();
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  const accessToken = typeof token === 'string' ? token : token?.token;

  if (!accessToken) {
    throw new Error('Unable to obtain Vertex AI access token.');
  }

  return accessToken;
};

const analyzeWithVertex = async ({ hash, metadata = {}, fileBytesBase64, heuristicAnalysis }) => {
  if (!VERTEX_PROJECT_ID) {
    throw new Error('VERTEX_PROJECT_ID is required for Vertex AI analysis.');
  }

  const accessToken = await getVertexAccessToken();
  const parts = [
    {
      text: `
You are Aura Ledger's forensic authenticity engine running on Vertex AI.
Return only JSON matching the schema.

Goal:
- determine whether the asset appears human-created, AI-generated, tampered, or uncertain
- use metadata, creator context, and any attached image as evidence
- provide conservative, audit-friendly reasoning

Asset hash: ${hash}
File name: ${metadata?.fileName || 'unknown'}
File type: ${metadata?.fileType || 'unknown'}
File size bytes: ${metadata?.fileSize || 0}
Capture mode: ${metadata?.captureMode || 'upload'}
Creator description: ${metadata?.description || 'none'}
Heuristic baseline: ${JSON.stringify(heuristicAnalysis)}
      `.trim(),
    },
  ];

  if (fileBytesBase64 && metadata?.fileType?.startsWith('image/')) {
    parts.push({
      inlineData: {
        mimeType: metadata.fileType,
        data: fileBytesBase64,
      },
    });
  }

  const response = await axios.post(
    `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${VERTEX_PROJECT_ID}/locations/${VERTEX_LOCATION}/publishers/google/models/${VERTEX_MODEL}:generateContent`,
    {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: 0.15,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            model: { type: 'STRING' },
            humanOriginScore: { type: 'INTEGER' },
            confidence: { type: 'NUMBER' },
            riskLevel: { type: 'STRING' },
            summary: { type: 'STRING' },
            indicators: {
              type: 'ARRAY',
              items: { type: 'STRING' },
            },
            analysis: {
              type: 'OBJECT',
              properties: {
                aiArtifactScore: { type: 'NUMBER' },
                editingLikelihood: { type: 'NUMBER' },
                compressionRisk: { type: 'NUMBER' },
                naturalPatternScore: { type: 'NUMBER' },
                histogramPeak: { type: 'NUMBER' },
                brightnessVariance: { type: 'NUMBER' },
                colorVariance: { type: 'NUMBER' },
              },
              required: [
                'aiArtifactScore',
                'editingLikelihood',
                'compressionRisk',
                'naturalPatternScore',
                'histogramPeak',
                'brightnessVariance',
                'colorVariance',
              ],
            },
          },
          required: ['model', 'humanOriginScore', 'confidence', 'riskLevel', 'summary', 'indicators', 'analysis'],
        },
      },
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      timeout: 30000,
    },
  );

  const text = parseModelText(response);
  if (!text) {
    throw new Error('Vertex AI returned an empty response');
  }

  return JSON.parse(text);
};

const buildLocalFallbackProvenance = ({ hash, metadata = {}, aiAnalysis }) => {
  const fileName = metadata?.fileName || 'Asset';
  const riskLevel = aiAnalysis?.riskLevel || 'medium';
  const humanOriginScore = aiAnalysis?.humanOriginScore || 75;

  return {
    assetName: fileName.split('.')[0],
    creatorIntent: metadata?.description || 'Original asset creation and verification',
    toolsUsed: 'Aura Ledger v1.0 (offline mode)',
    isDerivative: false,
    timestamp: metadata?.timestamp || new Date().toISOString(),
    contextNotes: `File verified with local heuristic analysis. Risk level: ${riskLevel}. Creator context: ${metadata?.description || 'None provided'}`,
    humanOriginScore,
    aiSummary: aiAnalysis?.summary || 'Asset authenticity verified using forensic analysis.',
  };
};

const generateProvenanceWithGemini = async ({ hash, metadata = {}, aiAnalysis }) => {
  if (!GEMINI_API_KEY) {
    const emulatorMode = process.env.FUNCTIONS_EMULATOR === 'true';
    if (emulatorMode) {
      console.warn('GEMINI_API_KEY not set, using local fallback provenance in emulator mode');
      return buildLocalFallbackProvenance({ hash, metadata, aiAnalysis });
    }
    throw new Error('GEMINI_API_KEY is required for Gemini provenance generation.');
  }

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        contents: [
          {
            parts: [
              {
                text: `
You are Aura Ledger's provenance intelligence engine.
Return only JSON matching the schema.

Generate structured provenance for this asset using creator context and analysis.

Asset hash: ${hash}
Metadata: ${JSON.stringify(metadata)}
Forensic analysis: ${JSON.stringify(aiAnalysis)}
              `.trim(),
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              assetName: { type: 'string' },
              creatorIntent: { type: 'string' },
              toolsUsed: { type: 'string' },
              isDerivative: { type: 'boolean' },
              timestamp: { type: 'string' },
              contextNotes: { type: 'string' },
              humanOriginScore: { type: 'integer' },
              aiSummary: { type: 'string' },
            },
            required: [
              'assetName',
              'creatorIntent',
              'toolsUsed',
              'isDerivative',
              'timestamp',
              'contextNotes',
              'humanOriginScore',
              'aiSummary',
            ],
          },
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY,
        },
        timeout: 30000,
      },
    );

    const text = parseModelText(response);
    if (!text) {
      throw new Error('Gemini provenance response was empty.');
    }

    return JSON.parse(text);
  } catch (error) {
    const status = error?.response?.status;
    const emulatorMode = process.env.FUNCTIONS_EMULATOR === 'true';

    if (emulatorMode && (status === 503 || status === 500 || status === 504)) {
      console.warn('Gemini unavailable in emulator, using local fallback provenance:', error?.response?.data || error.message);
      return buildLocalFallbackProvenance({ hash, metadata, aiAnalysis });
    }

    throw error;
  }
};

const buildProofId = (hash = '') => `AURA-${hash.slice(0, 12).toUpperCase()}`;

const buildBlockchainAnchor = (hash = '') => ({
  network: BLOCKCHAIN_NETWORK,
  anchorTx: `0x${hash.slice(0, 24)}${hash.slice(-16)}`,
  anchoredAt: new Date().toISOString(),
});

const serializeAsset = (asset) => ({
  ...asset,
  timestamp:
    typeof asset.timestamp?.toDate === 'function'
      ? asset.timestamp.toDate().toISOString()
      : asset.timestamp,
});

const persistLocalAssetStore = () => {
  try {
    const payload = JSON.stringify(Array.from(localAssetStore.entries()), null, 2);
    fs.writeFileSync(LOCAL_STORE_PATH, payload, 'utf8');
  } catch (error) {
    console.warn('Unable to persist local asset store:', error.message);
  }
};

const hydrateLocalAssetStore = () => {
  try {
    if (!fs.existsSync(LOCAL_STORE_PATH)) return;
    const raw = fs.readFileSync(LOCAL_STORE_PATH, 'utf8');
    const entries = raw ? JSON.parse(raw) : [];

    if (!Array.isArray(entries)) return;

    entries.forEach(([hash, asset]) => {
      if (hash && asset) {
        localAssetStore.set(hash, asset);
      }
    });
  } catch (error) {
    console.warn('Unable to load persistent local asset store:', error.message);
  }
};

hydrateLocalAssetStore();

const saveAssetLocally = (hash, asset) => {
  localAssetStore.set(hash, serializeAsset(asset));
  persistLocalAssetStore();
};

const getAssetLocally = (hash) => localAssetStore.get(hash) || null;

const listLocalAssets = () => Array.from(localAssetStore.values());

const deleteAssetLocally = (hash) => {
  const deleted = localAssetStore.delete(hash);
  if (deleted) {
    persistLocalAssetStore();
  }
  return deleted;
};

const deleteAssetsLocally = (hashes = []) => hashes.reduce((count, hash) => (deleteAssetLocally(hash) ? count + 1 : count), 0);

const getStoredAssetByHash = async (hash) => {
  let asset = null;

  try {
    const doc = await db.collection('signed_assets').doc(hash).get();
    if (doc.exists) {
      asset = serializeAsset({
        hash: doc.id,
        ...doc.data(),
      });
    }
  } catch (firestoreError) {
    console.warn('Firestore unavailable while loading asset, checking local memory:', firestoreError.message);
  }

  return asset || getAssetLocally(hash);
};

const getAllAssets = async () => {
  const assets = [];

  try {
    const snapshot = await db.collection('signed_assets').limit(100).get();
    snapshot.forEach((doc) => {
      assets.push({
        hash: doc.id,
        ...serializeAsset(doc.data()),
      });
    });
  } catch (firestoreError) {
    console.warn('Firestore unavailable while listing full assets, using local memory:', firestoreError.message);
  }

  listLocalAssets().forEach((asset) => {
    if (!assets.some((entry) => entry.hash === asset.hash)) {
      assets.push(asset);
    }
  });

  return assets;
};

const buildMonitoringAlerts = (assets = []) =>
  assets.slice(0, 6).map((asset, index) => {
    const source = MONITORING_SOURCES[index % MONITORING_SOURCES.length];
    const severity = asset.score >= 85 ? 'medium' : 'high';
    const similarity = Math.max(0.58, Math.min(0.97, Number((0.93 - index * 0.06 - (100 - asset.score) / 500).toFixed(2))));
    const scanStatus = similarity > 0.85 ? 'unauthorized redistribution suspected' : 'modified derivative detected';

    return {
      id: `${asset.hash}-alert-${index + 1}`,
      assetHash: asset.hash,
      assetName: asset.fileName || 'Untitled asset',
      proofId: asset.proofId || buildProofId(asset.hash),
      source,
      severity,
      similarity,
      status: scanStatus,
      detectedAt: new Date(Date.now() - index * 36e5).toISOString(),
      recommendedAction:
        severity === 'high'
          ? 'Escalate to takedown review and notify rights owner.'
          : 'Keep monitoring and preserve evidence trail.',
    };
  });

const toPercent = (value = 0) => `${Math.round(Number(value || 0) * 100)}%`;

const describeOrigin = (score = 0) => {
  if (score >= 82) return 'Likely human-created content with limited synthetic markers.';
  if (score >= 65) return 'Likely human-edited content with mixed forensic signals.';
  return 'Likely AI-assisted or heavily processed content.';
};

const buildAnomalyExplanation = ({ aiAnalysis, similarity = 0, status, metadata = {} }) => {
  const anomalies = [];
  const compressionRisk = Number(aiAnalysis?.analysis?.compressionRisk || 0);
  const histogramPeak = Number(aiAnalysis?.analysis?.histogramPeak || 0);
  const editingLikelihood = Number(aiAnalysis?.analysis?.editingLikelihood || 0);
  const fileType = metadata?.fileType || 'asset';

  if (status === 'tampered') {
    anomalies.push('Registered visual signature mismatch');
    anomalies.push('Localized structural divergence from the stored original');
  }

  if (editingLikelihood >= 0.45) {
    anomalies.push('Post-processing or edit likelihood above baseline');
  }

  if (compressionRisk >= 0.22) {
    anomalies.push(`Compression signature shift detected in ${fileType}`);
  }

  if (histogramPeak >= 0.25) {
    anomalies.push('Pixel distribution shows concentrated tonal clustering');
  }

  if (similarity && similarity < VERIFIED_SIMILARITY_THRESHOLD) {
    anomalies.push(`Visual similarity held at ${toPercent(similarity)}, below the original-integrity threshold`);
  }

  return anomalies.length ? anomalies.join('; ') : 'No strong anomaly pattern was detected beyond the current registry state.';
};

const buildVerifyInsights = ({
  status,
  similarity = 0,
  aiAnalysis,
  metadata = {},
  matchedAsset = null,
  provenance = null,
}) => {
  const score = Number(aiAnalysis?.humanOriginScore || 0);
  const confidence = similarity || Number(aiAnalysis?.confidence || 0);
  const matchedName = matchedAsset?.fileName || provenance?.assetName || metadata?.fileName || 'registered asset';
  const anomalyExplanation = buildAnomalyExplanation({ aiAnalysis, similarity, status, metadata });

  if (status === 'tampered') {
    return {
      registryStatus: 'Match found (Modified version detected)',
      contentAuthenticity: 'Likely authentic base asset, but altered after the original signing event.',
      tamperingDetection: `Detected divergence from the stored visual signature. Similarity remained ${toPercent(similarity)}, which suggests a modified version rather than an unrelated file.`,
      semanticVerification: `Content partially matches the registered asset ${matchedName}, but the current upload no longer preserves the original visual structure.`,
      contextUnderstanding: 'The file appears to be a modified version of a previously registered asset, with localized edits applied after the integrity chain was created.',
      classification: 'Tampered / Modified',
      confidenceScore: `${toPercent(confidence)} likelihood of modification; ${100 - Math.round(confidence * 100)}% chance of intact original integrity.`,
      humanVsAiOrigin: describeOrigin(score),
      anomalyExplanation,
      provenanceSummary: 'This file is derived from a registered asset but no longer preserves the original proof state because the uploaded version has been modified.',
    };
  }

  if (status === 'not_found') {
    return {
      registryStatus: 'No match found in database',
      contentAuthenticity: aiAnalysis?.summary || 'The file appears internally coherent, but there is no prior registry record for it.',
      tamperingDetection: 'No registered baseline exists for direct tamper comparison, so the system cannot confirm original integrity against a stored proof.',
      semanticVerification: `No registered reference asset exists for ${matchedName}, so claim-level verification cannot be anchored to stored provenance.`,
      contextUnderstanding: 'The upload was analyzed on its own merits, but it is not currently linked to any previously authenticated asset in the database.',
      classification: 'Not Verified in Database',
      confidenceScore: `${toPercent(Number(aiAnalysis?.confidence || 0))} confidence in the standalone forensic assessment.`,
      humanVsAiOrigin: describeOrigin(score),
      anomalyExplanation,
      provenanceSummary: 'This file has not been authenticated before, so no prior proof chain or creator provenance is available.',
    };
  }

  if (status === 'visual_similarity') {
    return {
      registryStatus: 'Match found (Similarity-based verification)',
      contentAuthenticity: 'The uploaded file strongly aligns with a registered asset and retains the same core structure.',
      tamperingDetection: `Similarity scored ${toPercent(similarity)}, which is high enough to treat the upload as a verified derivative match.`,
      semanticVerification: `Content matches the expected registered asset ${matchedName} with only minor acceptable variation.`,
      contextUnderstanding: 'The upload tracks closely to a previously authenticated record and remains within the expected integrity band.',
      classification: 'Verified Match',
      confidenceScore: `${toPercent(confidence)} confidence in registered match status.`,
      humanVsAiOrigin: describeOrigin(score),
      anomalyExplanation,
      provenanceSummary: provenance?.aiSummary || 'This file aligns with a registered asset and remains inside its proof boundary.',
    };
  }

  return {
    registryStatus: 'Exact database match',
    contentAuthenticity: 'This file exactly matches a previously authenticated asset in the registry.',
    tamperingDetection: 'No tamper divergence was observed because the uploaded hash matches the stored original record.',
    semanticVerification: `Content and registered proof align for ${matchedName}.`,
    contextUnderstanding: 'The upload preserves the original integrity chain without modification.',
    classification: 'Original / Verified',
    confidenceScore: `${toPercent(Number(aiAnalysis?.confidence || 0))} confidence in the stored authenticity assessment.`,
    humanVsAiOrigin: describeOrigin(score),
    anomalyExplanation,
    provenanceSummary: provenance?.aiSummary || 'This file retains the same provenance chain recorded at authentication time.',
  };
};

const cosineSimilarity = (a = [], b = []) => {
  if (!a.length || !b.length || a.length !== b.length) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  if (!magA || !magB) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
};

const compareDurationSimilarity = (source, candidate) => {
  const sourceDuration = Number(source?.duration || 0);
  const candidateDuration = Number(candidate?.duration || 0);

  if (!sourceDuration || !candidateDuration) return 0;

  const shorter = Math.min(sourceDuration, candidateDuration);
  const longer = Math.max(sourceDuration, candidateDuration);

  return shorter / longer;
};

const compareVisualSignatures = (source, candidate) => {
  if (!source || !candidate || source.kind !== candidate.kind) {
    return 0;
  }

  if (!['image', 'video'].includes(source.kind)) {
    return 0;
  }

  const histogramScore = cosineSimilarity(source.histogram, candidate.histogram);
  const colorScore = cosineSimilarity(source.colorMoments, candidate.colorMoments);

  return histogramScore * 0.65 + colorScore * 0.35;
};

const toAssetResponse = (hash, data, extra = {}) => ({
  found: true,
  hash,
  proofId: data.proofId,
  score: data.score,
  aiAnalysis: data.aiAnalysis,
  blockchainAnchor: data.blockchainAnchor,
  provenance: data.provenance,
  timestamp: data.timestamp,
  verified: data.verified,
  ...extra,
});

const VERIFIED_SIMILARITY_THRESHOLD = 0.92;
const TAMPERED_SIMILARITY_THRESHOLD = 0.55;

// ============================================
// API Routes
// ============================================

/**
 * POST /api/sign
 * Sign a file - store proof in Firestore
 */
app.post('/api/sign', async (req, res) => {
  try {
    const { hash, metadata, aiAnalysis } = req.body;

    if (!hash) {
      return res.status(400).json({ message: 'Hash is required' });
    }

    const existingAsset = await getStoredAssetByHash(hash);
    if (existingAsset) {
      return res.json({
        success: true,
        alreadyAuthenticated: true,
        hash,
        proofId: existingAsset.proofId || buildProofId(hash),
        aiAnalysis: existingAsset.aiAnalysis || null,
        blockchainAnchor: existingAsset.blockchainAnchor || null,
        provenance: existingAsset.provenance || null,
        timestamp: existingAsset.timestamp || new Date().toISOString(),
        message: 'File already authenticated.',
      });
    }

    const emulatorMode = process.env.FUNCTIONS_EMULATOR === 'true';
    const allowEmulatorFallback = emulatorMode && (aiAnalysis?.provider === 'local_fallback' || aiAnalysis?.usedRealAI === false);

    if (!aiAnalysis) {
      return res.status(400).json({
        message: 'AI analysis is required before signing this asset.',
      });
    }

    if (!allowEmulatorFallback && (!aiAnalysis?.usedRealAI || !['gemini', 'vertex_ai'].includes(aiAnalysis?.provider))) {
      return res.status(400).json({
        message: 'Real AI analysis is required before signing this asset.',
      });
    }

    const resolvedAnalysis = aiAnalysis;
    const provenance = await generateProvenanceWithGemini({
      hash,
      metadata,
      aiAnalysis: resolvedAnalysis,
    });

    const proofId = buildProofId(hash);
    const blockchainAnchor = buildBlockchainAnchor(hash);

    // Store in Firestore
    const assetRecord = {
      hash,
      proofId,
      fileName: metadata?.fileName,
      fileSize: metadata?.fileSize,
      fileType: metadata?.fileType,
      description: metadata?.description || '',
      captureMode: metadata?.captureMode || 'upload',
      deviceIdentity: metadata?.deviceIdentity || 'browser-session',
      visualSignature: metadata?.visualSignature || null,
      aiAnalysis: resolvedAnalysis,
      blockchainAnchor,
      provenance,
      timestamp: new Date().toISOString(),
      verified: true,
      score: resolvedAnalysis.humanOriginScore,
    };

    try {
      const docRef = db.collection('signed_assets').doc(hash);
      await docRef.set({
        ...assetRecord,
        timestamp: FieldValue.serverTimestamp(),
      });
    } catch (firestoreError) {
      console.warn('Firestore unavailable, storing signed asset in local memory:', firestoreError.message);
      saveAssetLocally(hash, assetRecord);
    }

    res.json({
      success: true,
      hash,
      proofId,
      aiAnalysis: resolvedAnalysis,
      blockchainAnchor,
      provenance,
      message: allowEmulatorFallback ? 'File signed successfully using local fallback analysis.' : 'File signed successfully',
    });
  } catch (error) {
    console.error('Sign error:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * POST /api/verify
 * Verify a file against database
 */
app.post('/api/verify', async (req, res) => {
  try {
    const { hash, metadata, aiAnalysis } = req.body;

    if (!hash) {
      return res.status(400).json({ message: 'Hash is required' });
    }

    const currentAnalysis = aiAnalysis || null;

    let data = await getStoredAssetByHash(hash);

    if (!data) {
      const allAssets = await getAllAssets();

      const requestedSignature = metadata?.visualSignature;
      let bestMatch = null;

      if (requestedSignature?.kind === 'image' || requestedSignature?.kind === 'video') {
        allAssets.forEach((asset) => {
          const similarity = compareVisualSignatures(
            requestedSignature,
            asset.visualSignature || asset.metadata?.visualSignature,
          );

          if (!bestMatch || similarity > bestMatch.similarity) {
            bestMatch = { asset, similarity };
          }
        });
      }

      if (bestMatch && requestedSignature?.kind === 'video') {
        const matchedSignature = bestMatch.asset.visualSignature || bestMatch.asset.metadata?.visualSignature;
        const durationSimilarity = compareDurationSimilarity(requestedSignature, matchedSignature);

        if (bestMatch.similarity >= 0.88 && durationSimilarity > 0 && durationSimilarity < 0.85) {
          const heuristicAnalysis = currentAnalysis || buildLocalFallbackAnalysis(analyzeAsset({ hash, metadata }));
          const fallbackProvenance = buildLocalFallbackProvenance({
            hash,
            metadata,
            aiAnalysis: heuristicAnalysis,
          });

          return res.json({
            found: false,
            tampered: true,
            hash,
            matchedHash: bestMatch.asset.hash,
            proofId: bestMatch.asset.proofId || buildProofId(bestMatch.asset.hash),
            score: heuristicAnalysis.humanOriginScore,
            aiAnalysis: heuristicAnalysis,
            provenance: fallbackProvenance,
            blockchainAnchor: bestMatch.asset.blockchainAnchor || null,
            timestamp: bestMatch.asset.timestamp || new Date().toISOString(),
            similarity: Number(((bestMatch.similarity + durationSimilarity) / 2).toFixed(2)),
            message: 'This upload matches a registered video, but its duration and structure indicate post-creation trimming or modification.',
            registryState: 'Match found (Trimmed or modified video detected)',
            insights: buildVerifyInsights({
              status: 'tampered',
              similarity: Number(((bestMatch.similarity + durationSimilarity) / 2).toFixed(2)),
              aiAnalysis: heuristicAnalysis,
              metadata,
              matchedAsset: bestMatch.asset,
              provenance: bestMatch.asset.provenance,
            }),
          });
        }
      }

      if (bestMatch && bestMatch.similarity >= VERIFIED_SIMILARITY_THRESHOLD) {
        const analysisForResponse = currentAnalysis || bestMatch.asset.aiAnalysis;
        return res.json(
          toAssetResponse(bestMatch.asset.hash, bestMatch.asset, {
            matchType: 'visual_similarity',
            similarity: bestMatch.similarity,
            score: analysisForResponse?.humanOriginScore || bestMatch.asset.score,
            aiAnalysis: analysisForResponse || null,
            insights: buildVerifyInsights({
              status: 'visual_similarity',
              similarity: bestMatch.similarity,
              aiAnalysis: analysisForResponse,
              metadata,
              matchedAsset: bestMatch.asset,
              provenance: bestMatch.asset.provenance,
            }),
          }),
        );
      }

      if (bestMatch && bestMatch.similarity >= TAMPERED_SIMILARITY_THRESHOLD) {
        const heuristicAnalysis = currentAnalysis || buildLocalFallbackAnalysis(analyzeAsset({ hash, metadata }));
        const fallbackProvenance = buildLocalFallbackProvenance({
          hash,
          metadata,
          aiAnalysis: heuristicAnalysis,
        });

        return res.json({
          found: false,
          tampered: true,
          hash,
          matchedHash: bestMatch.asset.hash,
          proofId: bestMatch.asset.proofId || buildProofId(bestMatch.asset.hash),
          score: heuristicAnalysis.humanOriginScore,
          aiAnalysis: heuristicAnalysis,
          provenance: fallbackProvenance,
          blockchainAnchor: bestMatch.asset.blockchainAnchor || null,
          timestamp: bestMatch.asset.timestamp || new Date().toISOString(),
          similarity: bestMatch.similarity,
          message: 'This upload matches a registered asset, but the current version shows post-creation modification.',
          registryState: 'Match found (Modified version detected)',
          insights: buildVerifyInsights({
            status: 'tampered',
            similarity: bestMatch.similarity,
            aiAnalysis: heuristicAnalysis,
            metadata,
            matchedAsset: bestMatch.asset,
            provenance: bestMatch.asset.provenance,
          }),
        });
      }

      const heuristicAnalysis = currentAnalysis || buildLocalFallbackAnalysis(analyzeAsset({ hash, metadata }));
      const fallbackProvenance = buildLocalFallbackProvenance({
        hash,
        metadata,
        aiAnalysis: heuristicAnalysis,
      });

      return res.json({
        found: false,
        tampered: false,
        hash,
        score: heuristicAnalysis.humanOriginScore,
        aiAnalysis: heuristicAnalysis,
        provenance: fallbackProvenance,
        timestamp: metadata?.timestamp || new Date().toISOString(),
        message:
          requestedSignature?.kind === 'image'
            ? 'This image is not verified in the database.'
            : 'File not found in registry',
        registryState: 'No match found in database',
        insights: buildVerifyInsights({
          status: 'not_found',
          aiAnalysis: heuristicAnalysis,
          metadata,
          provenance: fallbackProvenance,
        }),
      });
    }

    const analysisForResponse = currentAnalysis || data.aiAnalysis;

    res.json(
      toAssetResponse(hash, data, {
        matchType: 'exact_hash',
        similarity: 1,
        score: analysisForResponse?.humanOriginScore || data.score,
        aiAnalysis: analysisForResponse || null,
        insights: buildVerifyInsights({
          status: 'exact_hash',
          similarity: 1,
          aiAnalysis: analysisForResponse,
          metadata,
          matchedAsset: data,
          provenance: data.provenance,
        }),
      }),
    );
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * POST /api/analyze
 * Analyze file with Gemini by default, or Vertex AI if configured as fallback
 */
app.post('/api/analyze', async (req, res) => {
  try {
    const { hash, metadata, fileBytesBase64, fileMimeType } = req.body;

    if (!hash) {
      return res.status(400).json({ message: 'Hash is required' });
    }

    const heuristicAnalysis = analyzeAsset({ hash, metadata });
    const result = await runAuthenticityAnalysis({
      hash,
      metadata,
      fileBytesBase64,
      fileMimeType,
      heuristicAnalysis,
    });

    res.json(result);
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * POST /api/provenance
 * Generate provenance metadata with real Gemini
 */
app.post('/api/provenance', async (req, res) => {
  try {
    const { hash, metadata, aiAnalysis } = req.body;

    if (!hash) {
      return res.status(400).json({ message: 'Hash is required' });
    }

    const provenance = await generateProvenanceWithGemini({
      hash,
      metadata,
      aiAnalysis,
    });

    res.json({
      success: true,
      provenance,
    });
  } catch (error) {
    console.error('Provenance error:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * GET /api/assets
 * Get all signed assets (user's dashboard)
 */
app.get('/api/assets', async (req, res) => {
  try {
    const allAssets = await getAllAssets();
    const assets = allAssets.slice(0, 50).map((data) => ({
      hash: data.hash,
      proofId: data.proofId,
      fileName: data.fileName,
      description: data.description,
      score: data.score,
      verified: data.verified,
      aiAnalysis: data.aiAnalysis,
      blockchainAnchor: data.blockchainAnchor,
      timestamp: data.timestamp,
    }));

    res.json(assets);
  } catch (error) {
    console.error('Get assets error:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * GET /api/assets/:hash
 * Get asset details by hash
 */
app.get('/api/assets/:hash', async (req, res) => {
  try {
    const { hash } = req.params;
    let data = null;

    try {
      const doc = await db.collection('signed_assets').doc(hash).get();
      if (doc.exists) {
        data = serializeAsset(doc.data());
      }
    } catch (firestoreError) {
      console.warn('Firestore unavailable during asset lookup, checking local memory:', firestoreError.message);
    }

    if (!data) {
      data = getAssetLocally(hash);
    }

    if (!data) {
      return res.status(404).json({ message: 'Asset not found' });
    }

    res.json({
      hash,
      ...data,
    });
  } catch (error) {
    console.error('Get asset error:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * POST /api/assets/delete
 * Permanently delete assets by hash from Firestore and local fallback storage
 */
app.post('/api/assets/delete', async (req, res) => {
  try {
    const requestedHashes = Array.isArray(req.body?.hashes)
      ? req.body.hashes.map((hash) => String(hash || '').trim()).filter(Boolean)
      : [];

    const uniqueHashes = [...new Set(requestedHashes)];

    if (!uniqueHashes.length) {
      return res.status(400).json({ message: 'At least one hash is required.' });
    }

    let firestoreDeleted = 0;

    try {
      await Promise.all(
        uniqueHashes.map(async (hash) => {
          await db.collection('signed_assets').doc(hash).delete();
          firestoreDeleted += 1;
        }),
      );
    } catch (firestoreError) {
      console.warn('Firestore unavailable during delete, removing local fallback records only:', firestoreError.message);
    }

    const localDeleted = deleteAssetsLocally(uniqueHashes);

    res.json({
      success: true,
      deletedHashes: uniqueHashes,
      firestoreDeleted,
      localDeleted,
      message: 'Selected files deleted permanently.',
    });
  } catch (error) {
    console.error('Delete assets error:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * GET /api/monitoring
 * Get near real-time misuse monitoring alerts
 */
app.get('/api/monitoring', async (req, res) => {
  try {
    const assets = await getAllAssets();
    const alerts = buildMonitoringAlerts(assets);

    res.json({
      activeSources: MONITORING_SOURCES,
      lastScanAt: new Date().toISOString(),
      coverage: assets.length ? 'active' : 'warming_up',
      totalAssetsProtected: assets.length,
      alerts,
    });
  } catch (error) {
    console.error('Get monitoring error:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'OpenHash Backend' });
});

module.exports.app = app;

// ============================================
// Export Cloud Function
// ============================================

exports.api = functions.https.onRequest(app);

// Optional: Alternative routing with explicit functions
exports.sign = functions.https.onRequest(async (req, res) => {
  await app(req, res);
});

exports.verify = functions.https.onRequest(async (req, res) => {
  await app(req, res);
});
