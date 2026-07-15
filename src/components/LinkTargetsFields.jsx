'use client';

import { useState, useEffect } from 'react';
import {
  DEFAULT_LINK_TARGETS,
  getInitialLinkTargetRows,
  LINK_TYPE_LABELS,
  LINK_TYPE_TARGET_FIELDS,
  LINK_TYPES,
} from '@/lib/linkTargetConstants';

const inputStyle = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  borderRadius: '0.5rem',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--background)',
  color: 'var(--foreground)',
};

export default function LinkTargetsFields({ initialData = null, onTargetsChange = null }) {
  const [rows, setRows] = useState(() => getInitialLinkTargetRows(initialData));
  const [showModal, setShowModal] = useState(false);
  const [isCustom, setIsCustom] = useState(false);
  const [selectedType, setSelectedType] = useState(LINK_TYPES[0]);
  const [customTypeName, setCustomTypeName] = useState('');
  const [targetValue, setTargetValue] = useState(DEFAULT_LINK_TARGETS[LINK_TYPES[0]]);

  // Notify parent of changes
  useEffect(() => {
    if (onTargetsChange) {
      const targets = {};
      rows.forEach(row => {
        targets[row.linkType] = row.target;
      });
      onTargetsChange(targets);
    }
  }, [rows, onTargetsChange]);

  const removeRow = (index) => {
    setRows((current) => current.filter((_, i) => i !== index));
  };

  const openAddModal = () => {
    setIsCustom(false);
    setSelectedType(LINK_TYPES[0]);
    setCustomTypeName('');
    setTargetValue(DEFAULT_LINK_TARGETS[LINK_TYPES[0]]);
    setShowModal(true);
  };

  const handleAddRow = () => {
    if (isCustom && !customTypeName.trim()) {
      alert('Please enter a custom link type name');
      return;
    }
    
    const linkType = isCustom ? customTypeName.trim() : selectedType;
    setRows((current) => [
      ...current,
      { linkType, target: targetValue },
    ]);
    setShowModal(false);
  };

  const handleTypeChange = (newType) => {
    setSelectedType(newType);
    setTargetValue(DEFAULT_LINK_TARGETS[newType]);
  };

  const updateTarget = (index, value) => {
    setRows((current) =>
      current.map((row, i) =>
        i === index ? { ...row, target: parseInt(value, 10) || 0 } : row
      )
    );
  };

  const getDisplayLabel = (linkType) => {
    return LINK_TYPE_LABELS[linkType] || linkType;
  };

  const usedTypes = new Set(rows.map((row) => row.linkType));
  const removedTypes = LINK_TYPES.filter(
    (linkType) => !rows.some((row) => row.linkType === linkType)
  );

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <h4 style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>Link Targets Per Client</h4>

      {removedTypes.map((linkType) => (
        <input
          key={linkType}
          type="hidden"
          name={LINK_TYPE_TARGET_FIELDS[linkType]}
          value="0"
        />
      ))}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        {rows.map((row, index) => (
          <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.875rem', fontWeight: '500', display: 'block' }}>
              {getDisplayLabel(row.linkType)}
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="number"
                name={LINK_TYPE_TARGET_FIELDS[row.linkType] || `custom_${row.linkType}`}
                value={row.target}
                min="0"
                onChange={(e) => updateTarget(index, e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                type="button"
                onClick={() => removeRow(index)}
                style={{
                  backgroundColor: 'var(--danger)',
                  border: 'none',
                  color: 'white',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  padding: '0.5rem',
                  transition: 'all 0.2s ease',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '0.35rem',
                  minWidth: '32px',
                  minHeight: '40px',
                  opacity: '1',
                }}
                onMouseOver={(e) => {
                  e.target.style.opacity = '0.85';
                  e.target.style.transform = 'scale(1.05)';
                }}
                onMouseOut={(e) => {
                  e.target.style.opacity = '1';
                  e.target.style.transform = 'scale(1)';
                }}
                title="Delete this target"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: '1rem' }}>
        <button
          type="button"
          onClick={openAddModal}
          className="btn btn-primary"
          style={{
            fontSize: '0.875rem',
            padding: '0.65rem 1.25rem',
            whiteSpace: 'nowrap',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span style={{ fontSize: '1.1rem', lineHeight: '1' }}>+</span>
          <span>Add Link Target</span>
        </button>
      </div>

      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              backgroundColor: 'var(--background)',
              border: '1px solid var(--border)',
              borderRadius: '0.5rem',
              padding: 0,
              maxWidth: '400px',
              width: '90%',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with Tab Selection Bar */}
            <div style={{ padding: '2rem 2rem 0 2rem' }}>
              <h3 style={{ marginBottom: '1.5rem', margin: 0, marginBottom: '1.5rem' }}>Add Link Target</h3>
              
              {/* Tab selector with animated bar */}
              <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => setIsCustom(false)}
                    style={{
                      flex: 1,
                      padding: '0.75rem 1rem',
                      border: 'none',
                      backgroundColor: 'transparent',
                      color: isCustom ? 'var(--text-muted)' : 'var(--foreground)',
                      cursor: 'pointer',
                      fontWeight: isCustom ? '400' : '600',
                      fontSize: '0.9rem',
                      transition: 'color 0.2s ease',
                      position: 'relative',
                      zIndex: 1,
                    }}
                  >
                    Preset
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCustom(true)}
                    style={{
                      flex: 1,
                      padding: '0.75rem 1rem',
                      border: 'none',
                      backgroundColor: 'transparent',
                      color: isCustom ? 'var(--foreground)' : 'var(--text-muted)',
                      cursor: 'pointer',
                      fontWeight: isCustom ? '600' : '400',
                      fontSize: '0.9rem',
                      transition: 'color 0.2s ease',
                      position: 'relative',
                      zIndex: 1,
                    }}
                  >
                    Custom
                  </button>
                </div>
                
                {/* Animated underline bar */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: isCustom ? '50%' : '0',
                    width: '50%',
                    height: '3px',
                    backgroundColor: 'var(--primary)',
                    borderRadius: '3px 3px 0 0',
                    transition: 'left 0.3s ease',
                  }}
                />
                
                {/* Bottom border */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: '1px',
                    backgroundColor: 'var(--border)',
                  }}
                />
              </div>
            </div>

            {/* Content area */}
            <div style={{ padding: '1.5rem 2rem 2rem 2rem' }}>
              {/* Preset options */}
              {!isCustom && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.9rem' }}>
                    Link Type Name
                  </label>
                  <select
                    value={selectedType}
                    onChange={(e) => handleTypeChange(e.target.value)}
                    style={{
                      ...inputStyle,
                      cursor: 'pointer',
                    }}
                  >
                    {LINK_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {LINK_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Custom input */}
              {isCustom && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.9rem' }}>
                    Custom Link Type Name
                  </label>
                  <input
                    type="text"
                    value={customTypeName}
                    onChange={(e) => setCustomTypeName(e.target.value)}
                    placeholder="e.g. Social Media, Blog Post, etc."
                    style={inputStyle}
                    autoFocus
                  />
                </div>
              )}

              {/* Target Value */}
              <div style={{ marginBottom: '2rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.9rem' }}>
                  Target Value
                </label>
                <input
                  type="number"
                  value={targetValue}
                  onChange={(e) => setTargetValue(parseInt(e.target.value, 10) || 0)}
                  min="0"
                  style={inputStyle}
                />
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '0.5rem',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--background)',
                    color: 'var(--foreground)',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseOver={(e) => e.target.style.backgroundColor = 'var(--border)'}
                  onMouseOut={(e) => e.target.style.backgroundColor = 'var(--background)'}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddRow}
                  className="btn btn-primary"
                  style={{
                    padding: '0.5rem 1rem',
                    fontSize: '0.875rem',
                  }}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
