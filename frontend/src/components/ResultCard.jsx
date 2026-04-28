import React from 'react';
import styles from './ResultCard.module.css';
import { formatHash, copyToClipboard } from '../utils/crypto';

export default function ResultCard({ 
  result, 
  type = 'verified',
  onCopyHash 
}) {
  const isVerified = type === 'verified';
  const isTampered = type === 'tampered';
  const isNotFound = type === 'notFound';
  const isPending = type === 'pending';

  const handleCopy = async () => {
    const success = await copyToClipboard(result?.hash);
    onCopyHash?.(success);
  };

  return (
    <div className={`${styles.card} ${styles[type]}`}>
      <div className={styles.header}>
        <div className={styles.badge}>
          {isPending && <span className={styles.pending}>⏳ Processing</span>}
          {isVerified && <span className={styles.verified}>✓ Verified</span>}
          {isTampered && <span className={styles.tampered}>✗ Tampered</span>}
          {isNotFound && <span className={styles.notFound}>• Not Verified</span>}
        </div>
      </div>

      <div className={styles.content}>
        {isPending && (
          <div className={styles.loadingState}>
            <div className={styles.spinner}></div>
            <h3>Processing your file...</h3>
            <p>Running AI analysis and generating cryptographic proof</p>
          </div>
        )}

        {!isPending && (
          <>
            <h3 className={styles.title}>
              {isVerified && 'Verified'}
              {isTampered && 'Needs Review'}
              {isNotFound && 'Not Verified'}
            </h3>

            {result?.score !== undefined && (
              <div className={styles.scoreSection}>
                <div className={styles.scoreLabel}>Human Origin Score</div>
                <div className={styles.scoreBar}>
                  <div 
                    className={styles.scoreFill}
                    style={{ width: `${result.score}%` }}
                  ></div>
                </div>
                <div className={styles.scoreValue}>{result.score}%</div>
              </div>
            )}

            {result?.hash && (
              <div className={styles.hashSection}>
                <div className={styles.hashLabel}>SHA-256 Hash</div>
                <div className={styles.hashValue}>
                  <code>{formatHash(result.hash)}</code>
                  <button 
                    className={styles.copyBtn}
                    onClick={handleCopy}
                    title="Copy full hash"
                  >
                    📋
                  </button>
                </div>
              </div>
            )}

            {result?.proofId && (
              <div className={styles.hashSection}>
                <div className={styles.hashLabel}>Proof ID</div>
                <div className={styles.hashValue}>
                  <code>{result.proofId}</code>
                </div>
              </div>
            )}

            {result?.timestamp && (
              <div className={styles.timestamp}>
                <span>🕐 {new Date(result.timestamp).toLocaleString()}</span>
              </div>
            )}

            {result?.blockchainAnchor && (
              <div className={styles.timestamp}>
                <span>
                  ⛓ {result.blockchainAnchor.network} · {formatHash(result.blockchainAnchor.anchorTx)}
                </span>
              </div>
            )}

            {result?.message && (
              <div className={styles.timestamp}>
                <span>{result.message}</span>
              </div>
            )}

            {result?.aiAnalysis && (
              <div className={styles.provenanceSection}>
                <div className={styles.provenanceLabel}>AI Analysis</div>
                <pre className={styles.provenanceJson}>
                  {JSON.stringify(result.aiAnalysis, null, 2)}
                </pre>
              </div>
            )}

            {result?.provenance && (
              <div className={styles.provenanceSection}>
                <div className={styles.provenanceLabel}>Provenance Metadata</div>
                <pre className={styles.provenanceJson}>
                  {JSON.stringify(result.provenance, null, 2)}
                </pre>
              </div>
            )}

            {isTampered && (
              <div className={styles.warning}>
                <p>{result?.message || 'This file does not confidently match a signed asset yet.'}</p>
              </div>
            )}

            {isNotFound && (
              <div className={styles.neutral}>
                <p>{result?.message || 'This file is not verified in the database.'}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
