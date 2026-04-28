import React, { useState } from 'react';
import FileUpload from '../components/FileUpload';
import ResultCard from '../components/ResultCard';
import { calculateFileHash } from '../utils/crypto';
import { verifyFile } from '../utils/api';
import { extractVisualSignature } from '../utils/imageAnalysis';
import styles from './VerifyPage.module.css';

const publicOutputs = [
  'Verified or fake verdict',
  'Tamper alert if the file was altered',
  'Proof ID and blockchain anchor',
  'Human origin score and forensic summary',
  'Structured provenance for trust review',
];

export default function VerifyPage() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileHash, setFileHash] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleFileSelect = async (file) => {
    setSelectedFile(file);
    setError(null);
    setResult(null);

    try {
      setLoading(true);
      const hash = await calculateFileHash(file);
      setFileHash(hash);
      const visualSignature = await extractVisualSignature(file);

      const verifyResult = await verifyFile(hash, {
        fileName: file.name,
        fileType: file.type,
        visualSignature,
      });

      if (verifyResult.found) {
        setResult({
          hash: verifyResult.hash || hash,
          proofId: verifyResult.proofId,
          score: verifyResult.score || 85,
          aiAnalysis: verifyResult.aiAnalysis,
          provenance: verifyResult.provenance,
          blockchainAnchor: verifyResult.blockchainAnchor,
          timestamp: verifyResult.timestamp,
          verified: true,
          message:
            verifyResult.matchType === 'visual_similarity'
              ? `Matched signed asset through similarity analysis (${Math.round((verifyResult.similarity || 0) * 100)}% confidence).`
              : 'Authentic proof found for this exact asset hash.',
        });
      } else {
        const isImageReview = file.type?.startsWith('image/');
        const isTampered = Boolean(verifyResult.tampered);
        setResult({
          hash: verifyResult.matchedHash || hash,
          verified: false,
          tampered: isTampered,
          message:
            verifyResult.message ||
            (isImageReview
              ? 'This image appears altered or unregistered.'
              : 'This file is not registered in Aura Ledger.'),
          similarity: verifyResult.similarity,
        });
      }
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

  const handleVerifyAnother = () => {
    setResult(null);
    setFileHash(null);
    setSelectedFile(null);
    setError(null);
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <section className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>Public Verification Portal</span>
            <h1>Drag, drop, and verify whether a file is authentic.</h1>
            <p>
              Anyone can inspect an uploaded asset, compare it against creator proofs, and see
              whether the content is verified, altered, or entirely unregistered.
            </p>
          </div>

          <div className={styles.heroCard}>
            <span className={styles.noteLabel}>Public-facing outputs</span>
            <ul>
              {publicOutputs.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </section>

        <div className={styles.grid}>
          <div className={styles.verifySection}>
            {!result && (
              <div className={styles.portalCard}>
                <div className={styles.portalHeader}>
                  <div>
                    <span className={styles.kicker}>Verification step</span>
                    <h2>Upload the suspicious or claimed-original file</h2>
                  </div>
                  <p>
                    The portal checks exact hash matches first, then uses image similarity to
                    detect related but modified media.
                  </p>
                </div>
                <FileUpload onFileSelect={handleFileSelect} loading={loading && !fileHash} />
              </div>
            )}

            {error && (
              <div className={styles.error}>
                <p>❌ {error}</p>
              </div>
            )}

            {result && (
              <div className={styles.resultSection}>
                <ResultCard
                  result={result}
                  type={result.verified ? 'verified' : result.tampered ? 'tampered' : 'notFound'}
                  onCopyHash={handleCopyHash}
                />

                {!result.verified && (
                  <div className={styles.notFoundCard}>
                    <h3>{result.tampered ? 'Needs review' : 'Not verified in database'}</h3>
                    <p>{result.message}</p>
                    <p className={styles.subtitle}>
                      {result.tampered
                        ? 'Authentic assets should resolve to a proof ID, provenance package, and chain timestamp. This file appears related to a protected asset but was modified.'
                        : 'Authentic assets should resolve to a proof ID, provenance package, and chain timestamp. This file was not found in the protected asset database.'}
                    </p>
                  </div>
                )}

                <button
                  className="btn-secondary"
                  onClick={handleVerifyAnother}
                  style={{ width: '100%', marginTop: '1rem' }}
                >
                  Verify another file
                </button>
              </div>
            )}
          </div>

          <div className={styles.infoSection}>
            <div className={styles.infoCard}>
              <span className={styles.kicker}>What the portal checks</span>
              <ol>
                <li>SHA-256 fingerprint and exact proof match</li>
                <li>Visual similarity for cropped or modified images</li>
                <li>Stored AI analysis and provenance integrity</li>
                <li>Blockchain anchor and proof timestamp</li>
              </ol>
            </div>

            <div className={styles.infoCard}>
              <span className={styles.kicker}>Ideal for</span>
              <ul>
                <li>Rights holders reviewing reposts</li>
                <li>Journalists validating media origin</li>
                <li>Sports leagues checking clip misuse</li>
                <li>Platforms investigating abuse reports</li>
              </ul>
            </div>

            <div className={styles.infoCard}>
              <span className={styles.kicker}>Judge takeaway</span>
              <p>
                This portal turns cryptographic proof into something public and understandable,
                which is critical when trust has to extend beyond the original creator.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
