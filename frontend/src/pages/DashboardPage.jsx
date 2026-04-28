import React, { useState, useEffect } from 'react';
import { getSignedAssets, getMonitoringFeed } from '../utils/api';
import styles from './DashboardPage.module.css';

const phaseCards = [
  {
    title: 'Before misuse',
    text: 'Assets are fingerprinted, analyzed, and anchored at creation time.',
  },
  {
    title: 'During spread',
    text: 'Monitoring surfaces suspicious redistribution and derivative usage patterns.',
  },
  {
    title: 'After misuse',
    text: 'Proof IDs, timestamps, and AI evidence support disputes and takedown review.',
  },
];

export default function DashboardPage() {
  const [assets, setAssets] = useState([]);
  const [monitoring, setMonitoring] = useState({ alerts: [], activeSources: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [assetsData, monitoringData] = await Promise.all([getSignedAssets(), getMonitoringFeed()]);
        setAssets(assetsData || []);
        setMonitoring(monitoringData || { alerts: [], activeSources: [] });
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const filteredAssets = assets.filter((asset) => {
    if (filter === 'human') return asset.score > 75;
    if (filter === 'review') return asset.aiAnalysis?.riskLevel === 'high' || asset.score < 70;
    return true;
  });

  const stats = {
    total: assets.length,
    verified: assets.filter((asset) => asset.verified).length,
    alerts: monitoring.alerts?.length || 0,
    human: assets.filter((asset) => asset.score > 75).length,
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <section className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>Creator and Monitoring Dashboard</span>
            <h1>Track protected assets, proof health, and misuse signals in one place.</h1>
            <p>
              This dashboard is the “during spread” layer of Aura Ledger: a place for creators,
              leagues, and investigators to watch assets move across platforms and respond with
              evidence.
            </p>
          </div>

          <div className={styles.scanCard}>
            <span className={styles.noteLabel}>Monitoring status</span>
            <strong>{monitoring.coverage === 'active' ? 'Active watchlist' : 'Warming up'}</strong>
            <p>Last scan: {monitoring.lastScanAt ? new Date(monitoring.lastScanAt).toLocaleString() : 'Not available'}</p>
            <div className={styles.scanSources}>
              {(monitoring.activeSources || []).map((source) => (
                <span key={source}>{source}</span>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.phaseGrid}>
          {phaseCards.map((card) => (
            <article key={card.title} className={styles.phaseCard}>
              <h3>{card.title}</h3>
              <p>{card.text}</p>
            </article>
          ))}
        </section>

        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{stats.total}</div>
            <div className={styles.statLabel}>Protected assets</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{stats.verified}</div>
            <div className={styles.statLabel}>Verified proofs</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{stats.alerts}</div>
            <div className={styles.statLabel}>Spread alerts</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{stats.human}</div>
            <div className={styles.statLabel}>High-confidence human origin</div>
          </div>
        </div>

        {loading && (
          <div className={styles.loading}>
            <div className={styles.spinner}></div>
            <p>Loading monitoring and protected assets...</p>
          </div>
        )}

        {error && (
          <div className={styles.error}>
            <p>❌ {error}</p>
          </div>
        )}

        {!loading && !error && (
          <div className={styles.mainGrid}>
            <section className={styles.alertsPanel}>
              <div className={styles.panelHeader}>
                <div>
                  <span className={styles.kicker}>Monitoring feed</span>
                  <h2>Misuse and redistribution alerts</h2>
                </div>
                <p>Mock near-real-time tracking for suspicious reposts and derivative reuse.</p>
              </div>

              {monitoring.alerts?.length ? (
                <div className={styles.alertList}>
                  {monitoring.alerts.map((alert) => (
                    <article key={alert.id} className={styles.alertCard}>
                      <div className={styles.alertTop}>
                        <div>
                          <h3>{alert.assetName}</h3>
                          <p>{alert.source}</p>
                        </div>
                        <span className={alert.severity === 'high' ? styles.highBadge : styles.mediumBadge}>
                          {alert.severity}
                        </span>
                      </div>

                      <div className={styles.alertMeta}>
                        <span>Proof ID: {alert.proofId}</span>
                        <span>Similarity: {Math.round((alert.similarity || 0) * 100)}%</span>
                      </div>

                      <p className={styles.alertStatus}>{alert.status}</p>
                      <p className={styles.alertAction}>{alert.recommendedAction}</p>

                      <small>Detected {new Date(alert.detectedAt).toLocaleString()}</small>
                    </article>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <h3>No alerts yet</h3>
                  <p>Once protected assets exist, monitoring alerts will appear here.</p>
                </div>
              )}
            </section>

            <section className={styles.assetsPanel}>
              <div className={styles.panelHeader}>
                <div>
                  <span className={styles.kicker}>Creator vault</span>
                  <h2>Protected asset inventory</h2>
                </div>
                <p>Each record ties AI evidence to its proof ID and chain anchor.</p>
              </div>

              <div className={styles.filterSection}>
                <button className={filter === 'all' ? styles.activeFilter : ''} onClick={() => setFilter('all')}>
                  All assets
                </button>
                <button className={filter === 'human' ? styles.activeFilter : ''} onClick={() => setFilter('human')}>
                  Strong human origin
                </button>
                <button className={filter === 'review' ? styles.activeFilter : ''} onClick={() => setFilter('review')}>
                  Needs review
                </button>
              </div>

              {filteredAssets.length ? (
                <div className={styles.assetsList}>
                  {filteredAssets.map((asset) => (
                    <article key={asset.hash} className={styles.assetCard}>
                      <div className={styles.assetHeader}>
                        <div>
                          <h3>{asset.fileName || 'Untitled asset'}</h3>
                          <p>{asset.description || 'No creator context provided.'}</p>
                        </div>
                        <span className={asset.verified ? styles.verified : styles.unverified}>
                          {asset.verified ? 'verified' : 'review'}
                        </span>
                      </div>

                      <div className={styles.metaGrid}>
                        <div>
                          <span className={styles.label}>Proof ID</span>
                          <code>{asset.proofId || 'Pending'}</code>
                        </div>
                        <div>
                          <span className={styles.label}>Human origin</span>
                          <strong>{asset.score}%</strong>
                        </div>
                      </div>

                      <div className={styles.scoreBar}>
                        <div className={styles.bar}>
                          <div className={styles.fill} style={{ width: `${asset.score}%` }}></div>
                        </div>
                      </div>

                      <div className={styles.assetFooter}>
                        <small>{asset.blockchainAnchor?.network || 'Chain anchor pending'}</small>
                        <small>{asset.timestamp ? new Date(asset.timestamp).toLocaleDateString() : 'No timestamp'}</small>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <h3>No matching assets</h3>
                  <p>Try another filter or create a proof from the protect flow first.</p>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
