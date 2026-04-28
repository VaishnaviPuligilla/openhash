import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import styles from './Header.module.css';

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { label: 'Protect', path: '/' },
    { label: 'Verify Portal', path: '/verify' },
    { label: 'Monitoring', path: '/dashboard' },
  ];

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <div className={styles.logo} onClick={() => navigate('/')}>
          <div className={styles.logoIcon}>◆</div>
          <div>
            <span className={styles.logoText}>Aura Ledger</span>
            <span className={styles.logoTag}>Authenticity at creation time</span>
          </div>
        </div>

        <nav className={styles.nav}>
          {navItems.map((item) => (
            <button
              key={item.path}
              className={`${styles.navLink} ${location.pathname === item.path ? styles.active : ''}`}
              onClick={() => navigate(item.path)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className={styles.actions}>
          <button className="btn-primary" style={{ padding: '0.5rem 1.5rem' }} onClick={() => navigate('/verify')}>
            Public Proof Check
          </button>
        </div>
      </div>
    </header>
  );
}
