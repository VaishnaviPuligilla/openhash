import React, { useState, useRef } from 'react';
import styles from './FileUpload.module.css';

export default function FileUpload({ onFileSelect, loading = false }) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const inputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleFile(files[0]);
    }
  };

  const handleChange = (e) => {
    const files = e.target.files;
    if (files && files[0]) {
      handleFile(files[0]);
    }
  };

  const handleFile = (file) => {
    setSelectedFile(file);
    onFileSelect(file);
  };

  const handleClick = () => {
    inputRef.current?.click();
  };

  return (
    <div
      className={`${styles.uploadArea} ${dragActive ? styles.active : ''} ${
        loading ? styles.loading : ''
      }`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        ref={inputRef}
        type="file"
        onChange={handleChange}
        className={styles.input}
        disabled={loading}
      />

      <div className={styles.content}>
        {loading ? (
          <>
            <div className={styles.spinner}></div>
            <p className={styles.loadingText}>Processing file...</p>
          </>
        ) : (
          <>
            <div className={styles.icon}>📁</div>
            <h3 className={styles.title}>
              {selectedFile ? selectedFile.name : 'Drop your file here'}
            </h3>
            <p className={styles.subtitle}>
              {selectedFile 
                ? `Selected: ${(selectedFile.size / 1024 / 1024).toFixed(2)} MB`
                : 'or click to select'
              }
            </p>
            <p className={styles.hint}>Supports images, videos, documents, and more</p>
          </>
        )}
      </div>
    </div>
  );
}
