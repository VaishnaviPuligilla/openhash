const GRID_SIZE = 8;
const HISTOGRAM_BINS = 16;
const MAX_ANALYSIS_DIMENSION = 1024;
const ANALYSIS_IMAGE_MIME = 'image/jpeg';
const ANALYSIS_IMAGE_QUALITY = 0.82;

const clampChannel = (value) => Math.max(0, Math.min(255, value));

const normalize = (values) => {
  const total = values.reduce((sum, value) => sum + value, 0) || 1;
  return values.map((value) => Number((value / total).toFixed(4)));
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

const createImageBitmapFromFile = async (file) => {
  if ('createImageBitmap' in window) {
    return createImageBitmap(file);
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to decode image'));
    image.src = URL.createObjectURL(file);
  });
};

const loadVideoElementFromFile = async (file) =>
  new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const objectUrl = URL.createObjectURL(file);

    const cleanup = () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(objectUrl);
    };

    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      const targetTime = Number.isFinite(video.duration) && video.duration > 0.25 ? 0.2 : 0;
      const finalize = () => resolve({ video, cleanup });

      if (targetTime === 0) {
        finalize();
        return;
      }

      video.onseeked = () => finalize();
      video.currentTime = Math.min(targetTime, Math.max(0, video.duration - 0.05));
    };

    video.onerror = () => {
      cleanup();
      reject(new Error('Failed to decode video'));
    };

    video.src = objectUrl;
  });

const blobToUint8Array = async (blob) => {
  const buffer = await blob.arrayBuffer();
  return new Uint8Array(buffer);
};

export const buildAnalysisPayload = async (file) => {
  if (!file) {
    return { bytes: null, mimeType: '' };
  }

  if (!file.type?.startsWith('image/')) {
    const buffer = await file.arrayBuffer();
    return {
      bytes: new Uint8Array(buffer),
      mimeType: file.type || 'application/octet-stream',
    };
  }

  const image = await createImageBitmapFromFile(file);
  const width = image.width || GRID_SIZE;
  const height = image.height || GRID_SIZE;
  const longestSide = Math.max(width, height) || 1;
  const scale = Math.min(1, MAX_ANALYSIS_DIMENSION / longestSide);
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  if ('close' in image && typeof image.close === 'function') {
    image.close();
  }

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) {
          resolve(result);
          return;
        }

        reject(new Error('Failed to prepare image for AI analysis.'));
      },
      ANALYSIS_IMAGE_MIME,
      ANALYSIS_IMAGE_QUALITY,
    );
  });

  return {
    bytes: await blobToUint8Array(blob),
    mimeType: ANALYSIS_IMAGE_MIME,
  };
};

export const extractVisualSignature = async (file) => {
  if (!file?.type) {
    return null;
  }

  if (file.type.startsWith('video/')) {
    const { video, cleanup } = await loadVideoElementFromFile(file);
    const canvas = document.createElement('canvas');
    canvas.width = GRID_SIZE;
    canvas.height = GRID_SIZE;

    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(video, 0, 0, GRID_SIZE, GRID_SIZE);

    const { data } = context.getImageData(0, 0, GRID_SIZE, GRID_SIZE);
    const histogram = new Array(HISTOGRAM_BINS).fill(0);
    const colorMoments = [];

    for (let i = 0; i < data.length; i += 4) {
      const r = clampChannel(data[i]);
      const g = clampChannel(data[i + 1]);
      const b = clampChannel(data[i + 2]);
      const brightness = Math.round((r + g + b) / 3);
      const bin = Math.min(HISTOGRAM_BINS - 1, Math.floor((brightness / 256) * HISTOGRAM_BINS));

      histogram[bin] += 1;
      colorMoments.push(
        Number((r / 255).toFixed(3)),
        Number((g / 255).toFixed(3)),
        Number((b / 255).toFixed(3)),
      );
    }

    const signature = {
      kind: 'video',
      width: video.videoWidth || null,
      height: video.videoHeight || null,
      duration: Number.isFinite(video.duration) ? Number(video.duration.toFixed(3)) : null,
      histogram: normalize(histogram),
      colorMoments,
    };

    cleanup();
    return signature;
  }

  if (!file.type.startsWith('image/')) {
    return null;
  }

  const image = await createImageBitmapFromFile(file);
  const canvas = document.createElement('canvas');
  canvas.width = GRID_SIZE;
  canvas.height = GRID_SIZE;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, GRID_SIZE, GRID_SIZE);

  if ('close' in image && typeof image.close === 'function') {
    image.close();
  }

  const { data } = context.getImageData(0, 0, GRID_SIZE, GRID_SIZE);
  const histogram = new Array(HISTOGRAM_BINS).fill(0);
  const colorMoments = [];

  for (let i = 0; i < data.length; i += 4) {
    const r = clampChannel(data[i]);
    const g = clampChannel(data[i + 1]);
    const b = clampChannel(data[i + 2]);
    const brightness = Math.round((r + g + b) / 3);
    const bin = Math.min(HISTOGRAM_BINS - 1, Math.floor((brightness / 256) * HISTOGRAM_BINS));

    histogram[bin] += 1;
    colorMoments.push(
      Number((r / 255).toFixed(3)),
      Number((g / 255).toFixed(3)),
      Number((b / 255).toFixed(3)),
    );
  }

  return {
    kind: 'image',
    width: file.width || null,
    height: file.height || null,
    histogram: normalize(histogram),
    colorMoments,
  };
};

export const compareVisualSignatures = (source, candidate) => {
  if (!source || !candidate || source.kind !== 'image' || candidate.kind !== 'image') {
    return 0;
  }

  const histogramScore = cosineSimilarity(source.histogram, candidate.histogram);
  const colorScore = cosineSimilarity(source.colorMoments, candidate.colorMoments);

  return Number((histogramScore * 0.65 + colorScore * 0.35).toFixed(4));
};
