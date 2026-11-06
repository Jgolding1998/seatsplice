import React from 'react';

export function Skeleton({ label, kind = 'profile', rows = 1 }) {
  return (
    <div className={`loading loading-${kind}`} role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, row) => (
        <div className="loading-row" aria-hidden="true" key={row}>
          <div className="skeleton-group">
            <span className="skeleton-line skeleton-title" />
            <span className="skeleton-line" />
            <span className="skeleton-line skeleton-short" />
          </div>
          {kind === 'board' && (
            <>
              <div className="skeleton-tags">
                <span className="skeleton-line" />
                <span className="skeleton-line" />
              </div>
              <div className="skeleton-seats">
                <span className="skeleton-line" />
                <span className="skeleton-line" />
                <span className="skeleton-line" />
                <span className="skeleton-line" />
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
