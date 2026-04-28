import React, { useEffect, useState } from 'react';
import { analyzeFileWithAI, deleteAssets, signFile, verifyFile } from './utils/api';
import { calculateFileHash, formatHash } from './utils/crypto';
import { buildAnalysisPayload, extractVisualSignature } from './utils/imageAnalysis';
import './styles/globals.css';

const backgroundImage = new URL('../bg1.png', import.meta.url).href;

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'authenticate', label: 'Authenticate File', icon: 'authenticate' },
  { id: 'verify', label: 'Verify File', icon: 'verify' },
  { id: 'history', label: 'History', icon: 'history' },
  { id: 'profile', label: 'Profile', icon: 'profile' },
];

const emptyWorkspace = {
  file: null,
  fileHash: '',
  error: '',
  loading: false,
  result: null,
};

const SESSION_KEY = 'openhash.email.session';
const authenticatedStatusLabels = ['Authenticated', 'Already Authenticated', 'Already Verified', 'Verified Match', 'Original', 'Verified Original'];

const historyKeyFor = (email = 'guest') => `openhash.history.${email.toLowerCase()}`;

const readHistory = (email) => {
  if (!email) return [];

  try {
    const raw = localStorage.getItem(historyKeyFor(email));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeHistory = (email, records) => {
  if (!email) return;
  localStorage.setItem(historyKeyFor(email), JSON.stringify(records));
};

const formatDateTime = (value) => {
  if (!value) return 'Pending';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Pending';

  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const toPercent = (value, scale = 100) => {
  const numeric = Number(value || 0);
  const normalized = scale === 1 ? numeric * 100 : numeric;
  return `${Math.round(normalized)}%`;
};

const averageScore = (records) => {
  const values = records.map((record) => Number(record.score || 0)).filter((value) => !Number.isNaN(value) && value > 0);
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
};

const readSession = () => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const createSessionFromEmail = (email) => {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = readSession();
  if (existing?.email === normalizedEmail) return existing;

  return {
    uid: normalizedEmail,
    email: normalizedEmail,
    displayName: normalizedEmail.split('@')[0] || 'User',
    createdAt: new Date().toISOString(),
    mode: 'email',
  };
};

const persistSession = (session) => {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
};

const clearSession = () => {
  localStorage.removeItem(SESSION_KEY);
};

const decideAuthenticityVerdict = (aiAnalysis) => {
  const score = Number(aiAnalysis?.humanOriginScore || 0);
  const risk = aiAnalysis?.riskLevel || 'medium';
  const artifact = Number(aiAnalysis?.analysis?.aiArtifactScore || 0);
  const editing = Number(aiAnalysis?.analysis?.editingLikelihood || 0);

  if (score >= 85 && risk === 'low' && artifact < 0.35) {
    return { label: 'Verified Original', tone: 'good' };
  }

  if (risk === 'high' || artifact >= 0.55 || editing >= 0.65) {
    return { label: 'AI-Generated / Tampered', tone: 'bad' };
  }

  return { label: 'Suspicious', tone: 'warn' };
};

const normalizeAuthenticatedResult = ({ file, fileHash, signResult, analysisResult }) => {
  const aiAnalysis = signResult?.aiAnalysis || analysisResult;

  return {
    mode: 'authenticate',
    fileName: file.name,
    hash: fileHash,
    proofId: signResult?.proofId || 'Pending',
    statusLabel: 'Authenticated',
    statusTone: 'good',
    score: aiAnalysis?.humanOriginScore || 0,
    confidence: aiAnalysis?.confidence || 0,
    aiAnalysis,
    provenance: signResult?.provenance || null,
    blockchainAnchor: signResult?.blockchainAnchor || null,
    timestamp: signResult?.blockchainAnchor?.anchoredAt || signResult?.timestamp || new Date().toISOString(),
    message: signResult?.message || 'File authenticated and signed.',
    registryState: 'Authenticated in registry',
  };
};

const normalizeExistingAuthenticatedResult = ({ file, fileHash, verifyResult }) => ({
  mode: 'authenticate',
  fileName: file.name,
  hash: verifyResult?.hash || fileHash,
  proofId: verifyResult?.proofId || 'Matched',
  statusLabel: 'Already Authenticated',
  statusTone: 'good',
  score: verifyResult?.score || verifyResult?.aiAnalysis?.humanOriginScore || 0,
  confidence: verifyResult?.aiAnalysis?.confidence || 0,
  aiAnalysis: verifyResult?.aiAnalysis || null,
  provenance: verifyResult?.provenance || null,
  blockchainAnchor: verifyResult?.blockchainAnchor || null,
  timestamp: verifyResult?.timestamp || verifyResult?.blockchainAnchor?.anchoredAt || '',
  message: 'File already authenticated. Details shown below.',
  registryState: verifyResult?.insights?.registryStatus || 'Already authenticated in registry',
});

const normalizeVerifyResult = ({ file, fileHash, verifyResult }) => {
  if (verifyResult?.found) {
    const verdict = verifyResult.matchType === 'visual_similarity' ? 'Verified Match' : 'Already Verified';
    return {
      mode: 'verify',
      fileName: file.name,
      hash: verifyResult.hash || fileHash,
      proofId: verifyResult.proofId || 'Matched',
      statusLabel: verdict,
      statusTone: 'good',
      score: verifyResult.score || verifyResult.aiAnalysis?.humanOriginScore || 0,
      confidence: verifyResult.aiAnalysis?.confidence || 0,
      aiAnalysis: verifyResult.aiAnalysis || null,
      provenance: verifyResult.provenance || null,
      blockchainAnchor: verifyResult.blockchainAnchor || null,
      insights: verifyResult.insights || null,
      timestamp: verifyResult.timestamp || verifyResult.blockchainAnchor?.anchoredAt || '',
      message:
        verifyResult.matchType === 'visual_similarity'
          ? `Matched to an authenticated asset with ${Math.round((verifyResult.similarity || 0) * 100)}% similarity.`
          : 'File already verified. Details shown below.',
      registryState:
        verifyResult.insights?.registryStatus ||
        (verifyResult.matchType === 'visual_similarity' ? 'Matched in registry' : 'Verified in registry'),
      similarity: verifyResult.similarity || 1,
    };
  }

  if (verifyResult?.tampered) {
    return {
      mode: 'verify',
      fileName: file.name,
      hash: verifyResult.matchedHash || fileHash,
      proofId: 'Review Required',
      statusLabel: 'Tampered',
      statusTone: 'bad',
      score: verifyResult.score || verifyResult.aiAnalysis?.humanOriginScore || 0,
      confidence: verifyResult.similarity || verifyResult.aiAnalysis?.confidence || 0,
      aiAnalysis: verifyResult.aiAnalysis || null,
      provenance: verifyResult.provenance || null,
      blockchainAnchor: verifyResult.blockchainAnchor || null,
      insights: verifyResult.insights || null,
      timestamp: verifyResult.timestamp || '',
      message: verifyResult.message || 'Related asset found, but this upload has been modified.',
      registryState: verifyResult.registryState || verifyResult.insights?.registryStatus || 'Tampered against stored record',
      similarity: verifyResult.similarity || 0,
    };
  }

  return {
    mode: 'verify',
    fileName: file.name,
    hash: fileHash,
    proofId: 'Not Found',
    statusLabel: 'Not Verified in Database',
    statusTone: 'neutral',
    score: verifyResult.score || verifyResult.aiAnalysis?.humanOriginScore || 0,
    confidence: verifyResult.confidence || verifyResult.aiAnalysis?.confidence || 0,
    aiAnalysis: verifyResult.aiAnalysis || null,
    provenance: verifyResult.provenance || null,
    blockchainAnchor: verifyResult.blockchainAnchor || null,
    insights: verifyResult.insights || null,
    timestamp: verifyResult.timestamp || '',
    message: verifyResult?.message || 'No verified record exists for this file in the database.',
    registryState: verifyResult.registryState || verifyResult.insights?.registryStatus || 'Not verified in database',
    similarity: verifyResult?.similarity || 0,
  };
};

const buildHistoryEntry = (action, result) => ({
  id: `${action}-${result.hash}-${Date.now()}`,
  action,
  fileName: result.fileName,
  statusLabel: result.statusLabel,
  statusTone: result.statusTone,
  score: result.score,
  proofId: result.proofId,
  timestamp: result.timestamp || new Date().toISOString(),
  hash: result.hash,
  message: result.message,
  aiAnalysis: result.aiAnalysis,
  provenance: result.provenance,
  result,
});

const getHistoryResult = (entry) => {
  if (!entry) return null;
  if (entry.result) return entry.result;

  return {
    mode: entry.action?.toLowerCase() === 'authenticate' ? 'authenticate' : 'verify',
    fileName: entry.fileName,
    hash: entry.hash,
    proofId: entry.proofId,
    statusLabel: entry.statusLabel,
    statusTone: entry.statusTone || 'neutral',
    score: entry.score || 0,
    confidence: entry.confidence || 0,
    aiAnalysis: entry.aiAnalysis || null,
    provenance: entry.provenance || null,
    blockchainAnchor: entry.blockchainAnchor || null,
    insights: entry.insights || null,
    timestamp: entry.timestamp,
    message: entry.message || '',
    registryState: entry.registryState || 'History record',
    similarity: entry.similarity || 0,
  };
};

const Icon = ({ name }) => {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.7',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };

  const icons = {
    dashboard: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="11" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="17" width="7" height="4" rx="1.5" />
      </>
    ),
    authenticate: (
      <>
        <path d="M12 3l7 3v5c0 4.8-3 8.5-7 10-4-1.5-7-5.2-7-10V6l7-3z" />
        <path d="M9.5 12.5l1.8 1.8 3.7-4.1" />
      </>
    ),
    verify: (
      <>
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16.2 16.2L21 21" />
        <path d="M8.8 11.2l1.4 1.5 3-3.2" />
      </>
    ),
    history: (
      <>
        <path d="M4 12a8 8 0 108-8" />
        <path d="M4 4v4h4" />
        <path d="M12 8v4l2.8 1.8" />
      </>
    ),
    profile: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M5 20c1.8-3 4.2-4.5 7-4.5S17.2 17 19 20" />
      </>
    ),
    logout: (
      <>
        <path d="M10 4H6a2 2 0 00-2 2v12a2 2 0 002 2h4" />
        <path d="M14 16l4-4-4-4" />
        <path d="M9 12h9" />
      </>
    ),
    google: (
      <>
        <path d="M21 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.1c-.2 1.2-.9 2.3-2 3v2.5h3.2c1.9-1.7 2.7-4.2 2.7-7.3z" />
        <path d="M12 21c2.4 0 4.4-.8 5.9-2.2l-3.2-2.5c-.9.6-1.9.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H3.2v2.6C4.7 18.9 8 21 12 21z" />
        <path d="M6.9 13.4A5.5 5.5 0 016.6 12c0-.5.1-.9.2-1.4V8H3.2A9 9 0 003 12c0 1.4.3 2.8.9 4l3-2.6z" />
        <path d="M12 6.8c1.3 0 2.4.4 3.3 1.3l2.5-2.5C16.4 4.2 14.4 3.4 12 3.4A9 9 0 003.2 8l3.6 2.6c.7-2.2 2.7-3.8 5.2-3.8z" />
      </>
    ),
    file: (
      <>
        <path d="M8 3h6l5 5v13H8a2 2 0 01-2-2V5a2 2 0 012-2z" />
        <path d="M14 3v5h5" />
      </>
    ),
    spark: (
      <>
        <path d="M12 3l1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4L12 3z" />
        <path d="M19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15z" />
      </>
    ),
    chart: (
      <>
        <path d="M4 19h16" />
        <path d="M7 16l3-4 3 2 4-6" />
        <path d="M17 8h2v2" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16" />
        <path d="M9 7V4h6v3" />
        <path d="M7 7l1 13h8l1-13" />
        <path d="M10 11v5" />
        <path d="M14 11v5" />
      </>
    ),
    time: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v4l3 2" />
      </>
    ),
    alert: (
      <>
        <path d="M12 4l8 14H4l8-14z" />
        <path d="M12 9v4" />
        <path d="M12 16h.01" />
      </>
    ),
  };

  return (
    <svg className={`icon-svg icon-${name || 'file'}`} viewBox="0 0 24 24" aria-hidden="true">
      <g {...common}>{icons[name] || icons.file}</g>
    </svg>
  );
};

const SplashScreen = () => (
  <div className="splash-screen">
    <div className="splash-mark">OPENHASH</div>
  </div>
);

const AuthScreen = ({ email, busy, error, onEmailChange, onLogin }) => (
  <div className="auth-shell">
    <div className="auth-card">
      <div className="auth-brand">OPENHASH</div>
      <input
        type="email"
        className="auth-input"
        placeholder="Enter your email"
        value={email}
        onChange={(event) => onEmailChange(event.target.value)}
      />
      <button type="button" className="google-button" onClick={onLogin} disabled={busy || !email.trim()}>
        <span>{busy ? 'Opening Session' : 'Continue'}</span>
      </button>
      <div className="auth-note">This email is used for session history and profile.</div>
      {error && <div className="inline-error">{error}</div>}
    </div>
  </div>
);

const StatusBadge = ({ tone = 'neutral', children }) => (
  <span className={`status-badge status-${tone}`}>{children}</span>
);

const UploadPanel = ({
  title,
  actionLabel,
  workspace,
  busyLabel,
  onFileChange,
  onRun,
}) => {
  const inputId = `${title.replace(/\s+/g, '-').toLowerCase()}-input`;

  return (
    <section className="workspace-card">
      <div className="section-head">
        <div>
          <div className="section-title">{title}</div>
          <div className="section-subtitle">Image, video, document</div>
        </div>
        {workspace.result?.statusLabel && (
          <StatusBadge tone={workspace.result.statusTone}>{workspace.result.statusLabel}</StatusBadge>
        )}
      </div>

      <label
        className={`upload-surface ${workspace.loading ? 'upload-busy' : ''}`}
        htmlFor={inputId}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const [file] = event.dataTransfer.files || [];
          if (file) onFileChange(file);
        }}
      >
        <span className="upload-icon">
          <Icon name="file" />
        </span>
        <span className="upload-title">{workspace.file ? workspace.file.name : 'Drop a file or select one'}</span>
        <span className="upload-meta">{workspace.file ? `${workspace.file.type || 'Unknown type'} • ${Math.max(1, Math.round(workspace.file.size / 1024))} KB` : 'One file at a time'}</span>
      </label>

      <input
        id={inputId}
        className="hidden-input"
        type="file"
        onChange={(event) => {
          const [file] = event.target.files || [];
          if (file) onFileChange(file);
          event.target.value = '';
        }}
      />

      <div className="meta-grid">
        <div className="meta-card">
          <div className="meta-label">Fingerprint</div>
          <div className="meta-value">{workspace.fileHash ? formatHash(workspace.fileHash) : 'Waiting'}</div>
        </div>
        <div className="meta-card">
          <div className="meta-label">Status</div>
          <div className="meta-value">{workspace.loading ? busyLabel : workspace.file ? 'Ready' : 'Idle'}</div>
        </div>
      </div>

      <button
        type="button"
        className="primary-button"
        disabled={!workspace.file || !workspace.fileHash || workspace.loading}
        onClick={onRun}
      >
        {workspace.loading ? busyLabel : actionLabel}
      </button>

      {workspace.error && <div className="inline-error">{workspace.error}</div>}
    </section>
  );
};

const AuthenticateResultPanel = ({ user, result }) => {
  if (!result) {
    return (
      <section className="workspace-card">
        <div className="section-head">
          <div>
            <div className="section-title">Authentication Result</div>
            <div className="section-subtitle">Signed output appears here</div>
          </div>
        </div>
        <div className="meta-card">
          <div className="meta-label">Status</div>
          <div className="meta-value">No signed file yet</div>
        </div>
      </section>
    );
  }

  return (
    <section className="workspace-card">
      <div className="section-head">
        <div>
          <div className="section-title">Authentication Result</div>
          <div className="section-subtitle">Signed using this session email</div>
        </div>
        <StatusBadge tone={result.statusTone}>{result.statusLabel}</StatusBadge>
      </div>
      <div className="history-table-wrap">
        <table className="history-table analysis-table">
          <tbody>
            <tr>
              <th>Signed Using</th>
              <td>{user.email}</td>
            </tr>
            <tr>
              <th>Proof ID</th>
              <td>{result.proofId}</td>
            </tr>
            <tr>
              <th>SHA-256 Hash</th>
              <td>{formatHash(result.hash)}</td>
            </tr>
            <tr>
              <th>Authenticated</th>
              <td>Yes</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="inline-note">{result.message}</div>
    </section>
  );
};

const VerifyResultPanel = ({ result, showAnalysisToggle = true, showAnalysis = false, onToggleAnalysis = null }) => {
  if (!result) return null;

  return (
    <section className="workspace-card">
      <div className="section-head">
        <div>
          <div className="section-title">Verification Result</div>
          <div className="section-subtitle">Database and tamper review</div>
        </div>
        <StatusBadge tone={result.statusTone}>{result.statusLabel}</StatusBadge>
      </div>
      <div className="summary-grid">
        <div className="meta-card">
          <div className="meta-label">Database Status</div>
          <div className="meta-value">{result.registryState}</div>
        </div>
        <div className="meta-card">
          <div className="meta-label">Tampered</div>
          <div className="meta-value">{result.statusLabel === 'Tampered' ? 'Yes' : 'No'}</div>
        </div>
        <div className="meta-card">
          <div className="meta-label">Hash</div>
          <div className="meta-value">{formatHash(result.hash)}</div>
        </div>
        <div className="meta-card">
          <div className="meta-label">Timestamp</div>
          <div className="meta-value">{formatDateTime(result.timestamp)}</div>
        </div>
      </div>
      <div className="inline-note">{result.message}</div>
      {showAnalysisToggle && onToggleAnalysis && (
        <div className="button-row">
          <button
            type="button"
            className="secondary-button"
            onClick={onToggleAnalysis}
          >
            <Icon name="chart" />
            <span>{showAnalysis ? 'Hide Analysis' : 'Show Analysis'}</span>
          </button>
        </div>
      )}
    </section>
  );
};

const SummaryGrid = ({ result }) => {
  if (!result) {
    return (
      <div className="summary-grid">
        <div className="meta-card">
          <div className="meta-label">Awaiting File</div>
          <div className="meta-value">No active result</div>
        </div>
      </div>
    );
  }

  const scoreText = result.score ? `${result.score}/100` : 'Pending';

  return (
    <div className="summary-grid">
      <div className="meta-card">
        <div className="meta-label">Verdict</div>
        <div className="meta-value">{result.statusLabel}</div>
      </div>
      <div className="meta-card">
        <div className="meta-label">Confidence</div>
        <div className="meta-value">{result.confidence ? toPercent(result.confidence, 1) : 'Pending'}</div>
      </div>
      <div className="meta-card">
        <div className="meta-label">Registry</div>
        <div className="meta-value">{result.registryState}</div>
      </div>
      <div className="meta-card">
        <div className="meta-label">Proof Time</div>
        <div className="meta-value">{formatDateTime(result.timestamp)}</div>
      </div>
      <div className="meta-card">
        <div className="meta-label">SHA-256</div>
        <div className="meta-value">{formatHash(result.hash)}</div>
      </div>
      <div className="meta-card">
        <div className="meta-label">Score</div>
        <div className="meta-value">{scoreText}</div>
      </div>
    </div>
  );
};

const AnalysisBoard = ({ result }) => {
  const ai = result?.aiAnalysis;
  const provenance = result?.provenance;
  const cards = [
    {
      icon: 'authenticate',
      title: 'Content Authenticity',
      value: result?.statusLabel || 'Waiting',
      text: ai?.summary || result?.message || 'No analysis yet.',
    },
    {
      icon: 'alert',
      title: 'Tampering Review',
      value:
        result?.statusLabel === 'Tampered'
          ? 'Modification detected'
          : ai?.analysis?.editingLikelihood >= 0.65
            ? 'High edit risk'
            : 'No strong tamper signal',
      text:
        ai?.analysis?.editingLikelihood != null
          ? `Edit likelihood ${toPercent(ai.analysis.editingLikelihood, 1)}`
          : 'Run verification to inspect changes.',
    },
    {
      icon: 'verify',
      title: 'Semantic Verification',
      value: provenance?.assetName || result?.fileName || 'Awaiting asset',
      text: provenance?.contextNotes || result?.message || 'Event and claim consistency will appear here.',
    },
    {
      icon: 'spark',
      title: 'Context Understanding',
      value: ai?.riskLevel ? `${ai.riskLevel[0].toUpperCase()}${ai.riskLevel.slice(1)} risk` : 'Pending',
      text: ai?.indicators?.[0] || 'Detailed rationale appears after analysis.',
    },
    {
      icon: 'chart',
      title: 'Confidence Score',
      value: ai?.confidence ? toPercent(ai.confidence, 1) : 'Pending',
      text: ai?.humanOriginScore ? `${ai.humanOriginScore}% human-origin estimate` : 'No confidence score yet.',
    },
    {
      icon: 'dashboard',
      title: 'Classification',
      value: result?.statusLabel || 'Pending',
      text:
        result?.statusLabel === 'Verified Original' || result?.statusLabel === 'Authenticated' || result?.statusLabel === 'Already Authenticated'
          ? 'Authenticated and stored.'
          : result?.statusLabel === 'Already Verified'
            ? 'File already exists in the verified registry.'
          : result?.statusLabel === 'Tampered'
            ? 'Related asset changed after proof.'
            : result?.statusLabel === 'Not Authenticated'
              ? 'No prior proof in registry.'
              : 'Classification pending.',
    },
    {
      icon: 'time',
      title: 'Provenance Summary',
      value: provenance?.creatorIntent || 'Pending',
      text: provenance?.aiSummary || provenance?.toolsUsed || 'Creator notes and summary appear after authentication.',
    },
    {
      icon: 'history',
      title: 'Anomaly Explanation',
      value: ai?.indicators?.[1] || 'Pending',
      text:
        ai?.analysis?.compressionRisk != null
          ? `Compression risk ${toPercent(ai.analysis.compressionRisk, 1)}`
          : 'No anomaly comparison yet.',
    },
    {
      icon: 'profile',
      title: 'Human vs AI Origin',
      value:
        ai?.humanOriginScore >= 80
          ? 'Likely human-made'
          : ai?.humanOriginScore >= 60
            ? 'Mixed signals'
            : ai?.humanOriginScore
              ? 'Likely AI-assisted'
              : 'Pending',
      text:
        ai?.analysis?.aiArtifactScore != null
          ? `AI artifact signal ${toPercent(ai.analysis.aiArtifactScore, 1)}`
          : 'Origin estimate appears after analysis.',
    },
  ];

  return (
    <section className="workspace-card wide-card">
      <div className="section-head">
        <div>
          <div className="section-title">AI Analysis</div>
          <div className="section-subtitle">Structured evidence view</div>
        </div>
      </div>
      <SummaryGrid result={result} />
      <div className="analysis-grid">
        {cards.map((card) => (
          <article key={card.title} className="analysis-card">
            <div className="analysis-topline">
              <span className="analysis-icon">
                <Icon name={card.icon} />
              </span>
              <span className="analysis-title">{card.title}</span>
            </div>
            <div className="analysis-value">{card.value}</div>
            <div className="analysis-text">{card.text}</div>
          </article>
        ))}
      </div>
    </section>
  );
};

const VerifyAnalysisTable = ({ result }) => {
  const ai = result?.aiAnalysis;
  const provenance = result?.provenance;
  const insights = result?.insights || {};
  const rows = [
    ['AI Provider', ai?.provider ? `${ai.provider}${ai?.usedRealAI === false ? ' (fallback)' : ''}` : 'No AI provider available'],
    ['Registry Status', insights.registryStatus || result?.registryState || 'No registry state available'],
    ['Verification Result', result?.statusLabel || 'No verification result available'],
    ['Proof ID', result?.proofId || 'No proof ID available'],
    ['Hash', result?.hash ? formatHash(result.hash) : 'No hash available'],
    ['Timestamp', formatDateTime(result?.timestamp)],
    ['Confidence', result?.confidence ? toPercent(result.confidence, 1) : insights.confidenceScore || 'No confidence score available'],
    ['Score', result?.score ? `${result.score} / 100` : (ai?.humanOriginScore ? `${ai.humanOriginScore} / 100` : 'No score available')],
    ['Content Authenticity', insights.contentAuthenticity || ai?.summary || result?.message || 'No authenticity explanation available'],
    ['Tampering Detection', insights.tamperingDetection || (ai?.analysis?.editingLikelihood != null ? `Edit likelihood ${toPercent(ai.analysis.editingLikelihood, 1)}` : 'No tampering insight available')],
    ['Semantic Verification', insights.semanticVerification || provenance?.assetName || result?.fileName || 'No semantic verification available'],
    ['Context Understanding', insights.contextUnderstanding || ai?.indicators?.[0] || 'No contextual explanation available'],
    ['Classification', insights.classification || result?.statusLabel || 'No classification available'],
    ['Confidence Score', insights.confidenceScore || (result?.confidence ? toPercent(result.confidence, 1) : 'No confidence breakdown available')],
    ['Human vs AI Origin', insights.humanVsAiOrigin || (ai?.humanOriginScore ? `${ai.humanOriginScore}% human-origin estimate` : 'No origin estimate available')],
    ['Anomaly Explanation', insights.anomalyExplanation || ai?.indicators?.[1] || 'No anomaly explanation available'],
    ['Provenance Summary', insights.provenanceSummary || provenance?.aiSummary || provenance?.contextNotes || 'No provenance summary available'],
  ];

  return (
    <section className="workspace-card">
      <div className="section-head">
        <div>
          <div className="section-title">Verification Analysis</div>
          <div className="section-subtitle">Detailed table view</div>
        </div>
      </div>
      <div className="history-table-wrap">
        <table className="history-table analysis-table">
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}>
                <th>{label}</th>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

const DashboardView = ({ user, history }) => {
  const authenticatedCount = history.filter((item) => authenticatedStatusLabels.includes(item.statusLabel)).length;
  const flaggedCount = history.filter((item) => item.statusTone === 'bad' || item.statusTone === 'warn').length;
  const stats = [
    { label: 'Files Reviewed', value: `${history.length}`, icon: 'file' },
    { label: 'Authenticated', value: `${authenticatedCount}`, icon: 'authenticate' },
    { label: 'Flagged', value: `${flaggedCount}`, icon: 'alert' },
    { label: 'Average Score', value: `${averageScore(history)}%`, icon: 'chart' },
  ];

  return (
    <div className="view-stack">
      <section className="workspace-card">
        <div className="section-head">
          <div>
            <div className="section-title">Welcome to OpenHash</div>
            <div className="section-subtitle">{user.displayName}</div>
          </div>
        </div>
        <div className="stats-grid">
          {stats.map((stat) => (
            <article key={stat.label} className="stat-card">
              <span className="analysis-icon">
                <Icon name={stat.icon} />
              </span>
              <div className="stat-value">{stat.value}</div>
              <div className="stat-label">{stat.label}</div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};

const HistoryView = ({
  history,
  selectedHistoryId,
  selectedHistoryResult,
  user,
  onSelectItem,
  onDeleteItem,
  deleteBusyId,
}) => (
  <div className="view-stack">
    <section className="workspace-card">
      <div className="section-head">
        <div>
          <div className="section-title">History</div>
          <div className="section-subtitle">Saved to this account session</div>
        </div>
      </div>
      <div className="history-table-wrap">
        <table className="history-table">
          <thead>
            <tr>
              <th>File</th>
              <th>Action</th>
              <th>Result</th>
              <th>Score</th>
              <th>Proof</th>
              <th>Timestamp</th>
              <th>Delete</th>
            </tr>
          </thead>
          <tbody>
            {history.map((item) => (
              <tr key={item.id} className={selectedHistoryId === item.id ? 'history-row-active' : ''}>
                <td>
                  <button
                    type="button"
                    className="history-link-button"
                    onClick={() => onSelectItem(item)}
                  >
                    {item.fileName}
                  </button>
                </td>
                <td>{item.action}</td>
                <td>{item.statusLabel}</td>
                <td>{item.score ? `${item.score}%` : 'Pending'}</td>
                <td>{item.proofId}</td>
                <td>{formatDateTime(item.timestamp)}</td>
                <td>
                  <button
                    type="button"
                    className="secondary-button danger-button history-delete-button"
                    onClick={() => onDeleteItem(item)}
                    disabled={deleteBusyId === item.id || !item.hash}
                    aria-label={`Delete ${item.fileName}`}
                    title="Delete permanently"
                  >
                    <Icon name="trash" />
                  </button>
                </td>
              </tr>
            ))}
            {!history.length && (
              <tr>
                <td colSpan="7">No records for this account yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>

    {selectedHistoryResult && (
      <>
        {selectedHistoryResult.mode === 'authenticate' ? (
          <>
            <AuthenticateResultPanel user={user} result={selectedHistoryResult} />
            <AnalysisBoard result={selectedHistoryResult} />
          </>
        ) : (
          <>
            <VerifyResultPanel result={selectedHistoryResult} showAnalysisToggle={false} />
            <VerifyAnalysisTable result={selectedHistoryResult} />
          </>
        )}
      </>
    )}
  </div>
);

const ProfileView = ({ user, history, onLogout }) => (
  <div className="view-stack">
    <section className="workspace-card">
      <div className="profile-layout">
        <div className="profile-avatar">
          {user.photoURL ? <img src={user.photoURL} alt={user.displayName} /> : <span>{user.displayName.slice(0, 1).toUpperCase()}</span>}
        </div>
        <div className="profile-copy">
          <div className="section-title">{user.displayName}</div>
          <div className="section-subtitle">{user.email}</div>
          <div className="profile-meta">Created: {formatDateTime(user.createdAt)}</div>
          <div className="profile-meta">Account mode: {user.mode === 'firebase' ? 'Google' : 'Preview'}</div>
        </div>
        <button type="button" className="secondary-button logout-button" onClick={onLogout}>
          <Icon name="logout" />
          <span>Logout</span>
        </button>
      </div>
    </section>

    <section className="workspace-card">
      <div className="section-head">
        <div>
          <div className="section-title">Account Summary</div>
          <div className="section-subtitle">This user&apos;s saved activity</div>
        </div>
      </div>
      <div className="stats-grid">
        <article className="stat-card">
          <span className="analysis-icon">
            <Icon name="file" />
          </span>
          <div className="stat-value">{history.length}</div>
          <div className="stat-label">Entries</div>
        </article>
        <article className="stat-card">
          <span className="analysis-icon">
            <Icon name="chart" />
          </span>
          <div className="stat-value">{averageScore(history)}%</div>
          <div className="stat-label">Average Score</div>
        </article>
        <article className="stat-card">
          <span className="analysis-icon">
            <Icon name="authenticate" />
          </span>
          <div className="stat-value">
            {history.filter((item) => authenticatedStatusLabels.includes(item.statusLabel)).length}
          </div>
          <div className="stat-label">Originals</div>
        </article>
      </div>
    </section>
  </div>
);

function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [user, setUser] = useState(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [activeView, setActiveView] = useState('dashboard');
  const [authenticateWorkspace, setAuthenticateWorkspace] = useState(emptyWorkspace);
  const [verifyWorkspace, setVerifyWorkspace] = useState(emptyWorkspace);
  const [history, setHistory] = useState([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState('');
  const [showVerifyAnalysis, setShowVerifyAnalysis] = useState(false);
  const [deleteBusyId, setDeleteBusyId] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setShowSplash(false), 2200);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const sessionUser = readSession();
    if (sessionUser) {
      setUser(sessionUser);
      setAuthEmail(sessionUser.email);
    }
  }, []);

  useEffect(() => {
    if (!user?.email) {
      setHistory([]);
      setSelectedHistoryId('');
      return;
    }

    setHistory(readHistory(user.email));
  }, [user]);

  useEffect(() => {
    if (!history.length) {
      setSelectedHistoryId('');
      return;
    }

    if (selectedHistoryId && history.some((item) => item.id === selectedHistoryId)) {
      return;
    }

    setSelectedHistoryId(history[0].id);
  }, [history, selectedHistoryId]);

  const persistHistory = (entry) => {
    if (!user?.email) return;
    const next = [entry, ...history];
    setHistory(next);
    writeHistory(user.email, next);
    setSelectedHistoryId(entry.id);
  };

  const selectedHistoryEntry = history.find((item) => item.id === selectedHistoryId) || null;
  const selectedHistoryResult = getHistoryResult(selectedHistoryEntry);

  const handleDeleteHistoryItem = async (entry) => {
    if (!entry?.hash || !user?.email) return;

    setDeleteBusyId(entry.id);

    const nextHistory = history.filter((item) => item.id !== entry.id);
    setHistory(nextHistory);
    writeHistory(user.email, nextHistory);
    if (selectedHistoryId && nextHistory.every((item) => item.id !== selectedHistoryId)) {
      setSelectedHistoryId(nextHistory[0]?.id || '');
    }
    setAuthenticateWorkspace((current) =>
      current.fileHash === entry.hash
        ? { ...emptyWorkspace, error: '' }
        : current,
    );
    setVerifyWorkspace((current) =>
      current.fileHash === entry.hash
        ? { ...emptyWorkspace, error: '' }
        : current,
    );
    setShowVerifyAnalysis(false);

    try {
      await deleteAssets([entry.hash]);
    } catch (error) {
      console.warn('Backend delete did not complete:', error.message || error);
    } finally {
      setDeleteBusyId('');
    }
  };

  const selectFileForWorkspace = async (mode, file) => {
    const setter = mode === 'authenticate' ? setAuthenticateWorkspace : setVerifyWorkspace;
    if (mode === 'verify') setShowVerifyAnalysis(false);

    setter((current) => ({
      ...current,
      file,
      fileHash: '',
      error: '',
      result: null,
      loading: true,
    }));

    try {
      const fileHash = await calculateFileHash(file);
      setter((current) => ({
        ...current,
        file,
        fileHash,
        loading: false,
      }));
    } catch (error) {
      setter((current) => ({
        ...current,
        file: null,
        fileHash: '',
        loading: false,
        error: error.message || 'Unable to fingerprint this file.',
      }));
    }
  };

  const handleAuthenticate = async () => {
    if (!authenticateWorkspace.file || !authenticateWorkspace.fileHash) return;

    setAuthenticateWorkspace((current) => ({ ...current, loading: true, error: '' }));

    try {
      const duplicateCheck = await verifyFile(authenticateWorkspace.fileHash, {
        fileName: authenticateWorkspace.file.name,
        fileSize: authenticateWorkspace.file.size,
        fileType: authenticateWorkspace.file.type,
        timestamp: new Date().toISOString(),
        captureMode: 'upload',
      });

      if (duplicateCheck?.found && duplicateCheck?.matchType === 'exact_hash') {
        const result = normalizeExistingAuthenticatedResult({
          file: authenticateWorkspace.file,
          fileHash: authenticateWorkspace.fileHash,
          verifyResult: duplicateCheck,
        });

        setAuthenticateWorkspace((current) => ({
          ...current,
          loading: false,
          result,
        }));

        persistHistory(buildHistoryEntry('Authenticate', result));
        return;
      }

      const analysisPayload = await buildAnalysisPayload(authenticateWorkspace.file);
      const visualSignature = await extractVisualSignature(authenticateWorkspace.file);
      const metadata = {
        fileName: authenticateWorkspace.file.name,
        fileSize: authenticateWorkspace.file.size,
        fileType: authenticateWorkspace.file.type,
        timestamp: new Date().toISOString(),
        captureMode: 'upload',
        visualSignature,
        deviceIdentity: typeof navigator !== 'undefined' ? navigator.userAgent : 'browser',
        description: '',
      };

      const analysisResult = await analyzeFileWithAI(authenticateWorkspace.fileHash, analysisPayload, metadata);
      const signResult = await signFile(authenticateWorkspace.fileHash, analysisPayload.bytes, metadata, analysisResult);
      const result = normalizeAuthenticatedResult({
        file: authenticateWorkspace.file,
        fileHash: authenticateWorkspace.fileHash,
        signResult,
        analysisResult,
      });

      setAuthenticateWorkspace((current) => ({
        ...current,
        loading: false,
        result,
      }));

      persistHistory(buildHistoryEntry('Authenticate', result));
    } catch (error) {
      setAuthenticateWorkspace((current) => ({
        ...current,
        loading: false,
        error: error.message || 'Authentication failed.',
      }));
    }
  };

  const handleVerify = async () => {
    if (!verifyWorkspace.file || !verifyWorkspace.fileHash) return;

    setVerifyWorkspace((current) => ({ ...current, loading: true, error: '' }));

    try {
      const analysisPayload = await buildAnalysisPayload(verifyWorkspace.file);
      const visualSignature = await extractVisualSignature(verifyWorkspace.file);
      const metadata = {
        fileName: verifyWorkspace.file.name,
        fileSize: verifyWorkspace.file.size,
        fileType: verifyWorkspace.file.type,
        timestamp: new Date().toISOString(),
        captureMode: 'upload',
        visualSignature,
      };

      const analysisResult = await analyzeFileWithAI(verifyWorkspace.fileHash, analysisPayload, metadata);
      const verifyResult = await verifyFile(verifyWorkspace.fileHash, metadata, analysisResult);
      const result = normalizeVerifyResult({
        file: verifyWorkspace.file,
        fileHash: verifyWorkspace.fileHash,
        verifyResult,
      });

      setVerifyWorkspace((current) => ({
        ...current,
        loading: false,
        result,
      }));
      setShowVerifyAnalysis(false);

      persistHistory(buildHistoryEntry('Verify', result));
    } catch (error) {
      setVerifyWorkspace((current) => ({
        ...current,
        loading: false,
        error: error.message || 'Verification failed.',
      }));
    }
  };

  const handleLogin = async () => {
    const normalizedEmail = authEmail.trim().toLowerCase();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(normalizedEmail)) {
      setAuthError('Enter a valid email address.');
      return;
    }

    setAuthBusy(true);
    setAuthError('');

    try {
      const sessionUser = createSessionFromEmail(normalizedEmail);
      persistSession(sessionUser);
      setUser(sessionUser);
    } catch (error) {
      setAuthError(error.message || 'Unable to sign in.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    clearSession();
    setUser(null);
    setHistory([]);
    setActiveView('dashboard');
    setAuthenticateWorkspace(emptyWorkspace);
    setVerifyWorkspace(emptyWorkspace);
    setShowVerifyAnalysis(false);
  };

  const renderMainView = () => {
    if (activeView === 'dashboard') {
      return <DashboardView user={user} history={history} />;
    }

    if (activeView === 'authenticate') {
      return (
        <div className="view-stack">
          <UploadPanel
            title="Authenticate File"
            actionLabel="Authenticate"
            workspace={authenticateWorkspace}
            busyLabel="Authenticating"
            onFileChange={(file) => selectFileForWorkspace('authenticate', file)}
            onRun={handleAuthenticate}
          />
          <AuthenticateResultPanel user={user} result={authenticateWorkspace.result} />
        </div>
      );
    }

    if (activeView === 'verify') {
      return (
        <div className="view-stack">
          <UploadPanel
            title="Verify File"
            actionLabel="Verify"
            workspace={verifyWorkspace}
            busyLabel="Verifying"
            onFileChange={(file) => selectFileForWorkspace('verify', file)}
            onRun={handleVerify}
          />
          {verifyWorkspace.result && (
            <VerifyResultPanel
              result={verifyWorkspace.result}
              showAnalysisToggle
              showAnalysis={showVerifyAnalysis}
              onToggleAnalysis={() => setShowVerifyAnalysis((current) => !current)}
            />
          )}
          {showVerifyAnalysis && verifyWorkspace.result && <VerifyAnalysisTable result={verifyWorkspace.result} />}
        </div>
      );
    }

    if (activeView === 'history') {
      return (
        <HistoryView
          history={history}
          selectedHistoryId={selectedHistoryId}
          selectedHistoryResult={selectedHistoryResult}
          user={user}
          onSelectItem={(item) => setSelectedHistoryId(item.id)}
          onDeleteItem={handleDeleteHistoryItem}
          deleteBusyId={deleteBusyId}
        />
      );
    }

    return <ProfileView user={user} history={history} onLogout={handleLogout} />;
  };

  if (showSplash) {
    return (
      <div className="app-shell" style={{ '--bg-image': `url("${backgroundImage}")` }}>
        <SplashScreen />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-shell" style={{ '--bg-image': `url("${backgroundImage}")` }}>
        <AuthScreen
          email={authEmail}
          busy={authBusy}
          error={authError}
          onEmailChange={setAuthEmail}
          onLogin={handleLogin}
        />
      </div>
    );
  }

  return (
    <div className="app-shell" style={{ '--bg-image': `url("${backgroundImage}")` }}>
      <div className="app-overlay" />
      <div className="shell-frame">
        <aside className="sidebar">
          <div className="brand-block">
            <div className="brand-title">OPENHASH</div>
          </div>

          <nav className="nav-list">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`nav-button ${activeView === item.id ? 'nav-button-active' : ''}`}
                onClick={() => setActiveView(item.id)}
              >
                <span className="nav-icon">
                  <Icon name={item.icon} />
                </span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="sidebar-user">
            <div className="sidebar-user-avatar">
              {user.photoURL ? <img src={user.photoURL} alt={user.displayName} /> : <span>{user.displayName.slice(0, 1).toUpperCase()}</span>}
            </div>
            <div className="sidebar-user-copy">
              <div>{user.displayName}</div>
              <small>{user.email}</small>
            </div>
          </div>

          <button type="button" className="nav-button nav-logout" onClick={handleLogout}>
            <span className="nav-icon">
              <Icon name="logout" />
            </span>
            <span>Logout</span>
          </button>
        </aside>

        <main className="main-panel">{renderMainView()}</main>
      </div>
    </div>
  );
}

export default App;
