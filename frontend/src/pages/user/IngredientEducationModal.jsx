import { useEffect, useState } from 'react';
import api from '../../api/axios';
import { Loading } from '../../components/Shared';

const IRRITATION_BADGE = { low: 'badge-green', medium: 'badge-amber', high: 'badge-red' };
const SEVERITY_BADGE = { high: 'badge-red', moderate: 'badge-amber' };

/**
 * Full Ingredient Education view for one ingredient: what it is, what it
 * does, who it suits, how it's used, precautions, and any real
 * interaction warnings (from GET /ingredients/:id/education — all
 * fields sourced from the real ingredients catalog + interaction
 * analysis, nothing invented here).
 */
export default function IngredientEducationModal({ ingredientId, onClose }) {
  const [edu, setEdu] = useState(undefined); // undefined = loading, null = error
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ingredientId) return;
    setEdu(undefined);
    api.get(`/ingredients/${ingredientId}/education`)
      .then(({ data }) => setEdu(data.education))
      .catch((err) => {
        setEdu(null);
        setError(err.response?.data?.message || 'Could not load ingredient education right now.');
      });
  }, [ingredientId]);

  if (!ingredientId) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        {edu === undefined && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline btn-sm" onClick={onClose}>Close</button>
            </div>
            <Loading label="Loading ingredient education..." />
          </>
        )}

        {edu === null && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline btn-sm" onClick={onClose}>Close</button>
            </div>
            <div className="alert alert-error">{error}</div>
          </>
        )}

        {edu && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ margin: 0 }}>{edu.name}</h3>
                {edu.category && <span className="text-soft" style={{ fontSize: 12.5 }}>{edu.category}</span>}
              </div>
              <button className="btn btn-outline btn-sm" onClick={onClose}>Close</button>
            </div>

            <div className="card-tag-row" style={{ marginTop: 10 }}>
              <span className={`badge ${IRRITATION_BADGE[edu.irritation_potential] || 'badge-gray'}`}>
                {edu.irritation_potential} irritation
              </span>
              {edu.comedogenic_rating != null && (
                <span className="badge badge-gray">Comedogenic: {edu.comedogenic_rating}/5</span>
              )}
            </div>

            <h4 style={{ marginTop: 16, marginBottom: 4 }}>What it is</h4>
            <p style={{ fontSize: 13.5 }}>{edu.what_it_is}</p>

            {edu.what_it_does?.length > 0 && (
              <>
                <h4 style={{ marginTop: 12, marginBottom: 4 }}>What it does</h4>
                <p style={{ fontSize: 13.5 }}>{edu.what_it_does.join(' • ')}</p>
              </>
            )}

            {(edu.suitable_skin_types?.length > 0 || edu.suitable_concerns?.length > 0) && (
              <>
                <h4 style={{ marginTop: 12, marginBottom: 4 }}>Suitable for</h4>
                <div className="card-tag-row">
                  {edu.suitable_skin_types.map((t) => <span key={t} className="badge badge-blue">{t}</span>)}
                  {edu.suitable_concerns.map((c) => <span key={c} className="badge badge-purple">{c}</span>)}
                </div>
              </>
            )}

            <h4 style={{ marginTop: 12, marginBottom: 4 }}>How it's used</h4>
            <p style={{ fontSize: 13.5 }}>{edu.how_its_used}</p>

            {edu.precautions && (
              <>
                <h4 style={{ marginTop: 12, marginBottom: 4 }}>Precautions</h4>
                <div className="card-warning">⚠️ {edu.precautions}</div>
              </>
            )}

            <h4 style={{ marginTop: 14, marginBottom: 6 }}>Interaction Warnings</h4>
            {edu.interaction_warnings.length === 0 ? (
              <p className="text-muted" style={{ fontSize: 13 }}>No known interaction conflicts on file for this ingredient.</p>
            ) : (
              edu.interaction_warnings.map((w, idx) => {
                const other = w.ingredient_a.name === edu.name ? w.ingredient_b : w.ingredient_a;
                return (
                  <div key={idx} className="card-warning" style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <strong>With {other.name}</strong>
                      <span className={`badge ${SEVERITY_BADGE[w.severity] || 'badge-gray'}`}>{w.severity}</span>
                    </div>
                    <div style={{ fontSize: 12.5 }}>{w.explanation}</div>
                    <div style={{ fontSize: 12, marginTop: 4, fontStyle: 'italic' }}>{w.recommended_usage}</div>
                  </div>
                );
              })
            )}
          </>
        )}
      </div>
    </div>
  );
}
