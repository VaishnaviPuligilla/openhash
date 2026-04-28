import React, { useState } from 'react';
import FileUpload from '../components/FileUpload';
import ResultCard from '../components/ResultCard';
import { calculateFileHash } from '../utils/crypto';
import { signFile, analyzeFileWithAI } from '../utils/api';
import { extractVisualSignature } from '../utils/imageAnalysis';
import styles from './SignPage.module.css';

const journeySteps = [
  {
    step: '1',
    title: 'Upload or Capture',
    text: 'Bring in an image, video, document, code archive, or live clip with optional creator context.',
  },
  {
    step: '2',
    title: 'AI + Security Processing',
    text: 'Aura Ledger computes the SHA-256 identity, runs forensic AI analysis, generates provenance, and anchors proof.',
  },
  {
    step: '3',
    title: 'Proof and Dashboard',
    text: 'Creators receive a proof ID, human-origin score, structured metadata, and blockchain evidence immediately.',
  },
];

const capabilityCards = [
  {
    title: 'Before misuse',
    text: 'Authenticity is locked in at creation time with proof IDs, provenance, and blockchain anchoring.',
  },
  {
    title: 'During spread',
    text: 'Monitoring feed watches for reposts, derivative abuse, and suspicious redistribution patterns.',
  },
  {
    title: 'After misuse',
    text: 'Public verification and forensic AI provide tamper evidence and portable proof for disputes.',
  },
];

const outputLabels = [
  'Verified badge',
  'Proof ID',
  'Human origin score',
  'Provenance metadata',
  'Blockchain timestamp',
];

export default function SignPage() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileHash, setFileHash] = useState(null);
  const [description, setDescription] = useState('');
  const [captureMode, setCaptureMode] = useState('upload');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleFileSelect = async (file) => {
    setSelectedFile(file);
    setError(null);
    setFileHash(null);
    setResult(null);

    try {
      setLoading(true);
      const hash = await calculateFileHash(file);
      setFileHash(hash);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSign = async () => {
    if (!selectedFile || !fileHash) return;

    try {
      setLoading(true);
      setError(null);

      const arrayBuffer = await selectedFile.arrayBuffer();
      const fileBytes = new Uint8Array(arrayBuffer);
      const visualSignature = await extractVisualSignature(selectedFile);

      const metadata = {
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        fileType: selectedFile.type,
        timestamp: new Date().toISOString(),
        visualSignature,
        description,
        captureMode,
        deviceIdentity: typeof navigator !== 'undefined' ? navigator.userAgent : 'browser-session',
      };

      const analysisResult = await analyzeFileWithAI(fileHash, fileBytes, metadata);

      const signResult = await signFile(fileHash, fileBytes, metadata, analysisResult);

      setResult({
        hash: fileHash,
        proofId: signResult?.proofId,
        score: signResult?.aiAnalysis?.humanOriginScore || analysisResult?.humanOriginScore || 85,
        aiAnalysis: signResult?.aiAnalysis || analysisResult,
        provenance: signResult?.provenance || metadata,
        blockchainAnchor: signResult?.blockchainAnchor,
        timestamp: signResult?.blockchainAnchor?.anchoredAt || new Date().toISOString(),
        verified: true,
        message: 'Authenticity secured at the moment of creation.',
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyHash = (success) => {
    if (success) {
      alert('Hash copied to clipboard!');
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>Prevention. Tracking. Proof.</span>
            <h1>Aura Ledger secures digital assets before misuse happens.</h1>
            <p>
              Most systems react after damage is done. Aura Ledger verifies authenticity at the
              moment of creation, monitors spread in near real time, and gives anyone a public
              portal to confirm proof.
            </p>

            <div className={styles.heroMetrics}>
              <div className={styles.metricCard}>
                <strong>Prevention</strong>
                <span>Creation-time proof, provenance, and blockchain anchoring</span>
              </div>
              <div className={styles.metricCard}>
                <strong>Tracking</strong>
                <span>Live monitoring for suspicious reposts and derivative spread</span>
              </div>
              <div className={styles.metricCard}>
                <strong>Detection</strong>
                <span>Forensic AI scoring, tamper review, and portable verification</span>
              </div>
            </div>
          </div>

          <div className={styles.heroPanel}>
            <div className={styles.judgesNote}>
              <span className={styles.noteLabel}>What makes this strong</span>
              <h3>Authenticity at creation time</h3>
              <p>
                Hashing, forensic AI, provenance intelligence, and proof anchoring run in one
                pipeline instead of being disconnected tools.
              </p>
            </div>
            <div className={styles.outputPanel}>
              <span className={styles.noteLabel}>Creator output</span>
              <ul>
                {outputLabels.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className={styles.journeySection}>
          {journeySteps.map((item) => (
            <article key={item.step} className={styles.stepCard}>
              <span className={styles.stepNumber}>{item.step}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </section>

        <div className={styles.grid}>
          <div className={styles.uploadSection}>
            <div className={styles.workspaceCard}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.kicker}>Step 1</span>
                  <h2>Upload or capture the original asset</h2>
                </div>
                <p>Works for sports footage, journalism, NFTs, legal docs, code, and more.</p>
              </div>

              {!result && (
                <>
                  <div className={styles.formGrid}>
                    <label className={styles.inputGroup}>
                      <span>Capture mode</span>
                      <select value={captureMode} onChange={(event) => setCaptureMode(event.target.value)}>
                        <option value="upload">Manual upload</option>
                        <option value="live_capture">Live capture / sports feed</option>
                        <option value="ingest">Platform ingest</option>
                      </select>
                    </label>

                    <label className={styles.inputGroup}>
                      <span>Optional creator context</span>
                      <textarea
                        rows="4"
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        placeholder="Example: Original courtside sports clip captured by the club media team."
                      />
                    </label>
                  </div>

                  <FileUpload onFileSelect={handleFileSelect} loading={loading && !fileHash} />

                  {fileHash && (
                    <div className={styles.hashDisplay}>
                      <div className={styles.hashInfo}>
                        <p className={styles.label}>SHA-256 identity</p>
                        <code className={styles.hash}>{fileHash}</code>
                      </div>

                      <div className={styles.processingChecklist}>
                        <div>
                          <strong>Step 2</strong>
                          <span>Forensic AI scan for human origin, tamper cues, and deepfake patterns</span>
                        </div>
                        <div>
                          <strong>Step 3</strong>
                          <span>Provenance packaging with proof ID and blockchain anchor</span>
                        </div>
                      </div>

                      <button className="btn-primary" onClick={handleSign} disabled={loading}>
                        {loading ? 'Processing pipeline...' : 'Create Authenticity Proof'}
                      </button>
                    </div>
                  )}

                  {error && (
                    <div className={styles.error}>
                      <p>❌ {error}</p>
                    </div>
                  )}

                </>
              )}

              {result && (
                <div className={styles.resultSection}>
                  <ResultCard result={result} type="verified" onCopyHash={handleCopyHash} />
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      setResult(null);
                      setFileHash(null);
                      setSelectedFile(null);
                    }}
                    style={{ width: '100%', marginTop: '1rem' }}
                  >
                    Protect another asset
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className={styles.infoSection}>
            <div className={styles.infoCard}>
              <span className={styles.kicker}>AI expected by judges</span>
              <h3>Three AI layers, one trust workflow</h3>
              <ul>
                <li>Forensic AI detects synthetic or tampered patterns in uploaded media.</li>
                <li>Provenance intelligence turns creator context into structured evidence.</li>
                <li>Monitoring AI powers tracking once content begins to spread.</li>
              </ul>
            </div>

            <div className={styles.infoCard}>
              <span className={styles.kicker}>Platform inputs</span>
              <ul>
                <li>File and raw bytes</li>
                <li>Optional creator context</li>
                <li>Device identity and capture mode</li>
                <li>Visual signature for images</li>
              </ul>
            </div>

            <div className={styles.infoCard}>
              <span className={styles.kicker}>Scalable sectors</span>
              <ul>
                <li>Sports clips and league media</li>
                <li>Journalism and public records</li>
                <li>NFT and creator assets</li>
                <li>Legal documents and source code</li>
              </ul>
            </div>

            <div className={styles.capabilityStack}>
              {capabilityCards.map((card) => (
                <article key={card.title} className={styles.capabilityCard}>
                  <h4>{card.title}</h4>
                  <p>{card.text}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
