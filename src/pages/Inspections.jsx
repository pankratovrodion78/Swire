import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getReport, saveReport } from '../utils/storage';
import { getRecipesByIds } from '../utils/recipes';
import InspectionWizard from '../components/InspectionWizard';
import RecipeSelector from '../components/RecipeSelector';

export default function Inspections() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState(null);
  const [showRecipePicker, setShowRecipePicker] = useState(false);
  const reportRef = useRef(null);

  useEffect(() => {
    const r = getReport(id);
    if (!r) return navigate('/');
    setReport(r);
    reportRef.current = r;
  }, [id, navigate]);

  function updateReport(updated) {
    setReport(updated);
    reportRef.current = updated;
    saveReport(updated);
  }

  function handleWizardComplete(inspectionData) {
    const current = reportRef.current;
    if (!current) return;
    const updated = {
      ...current,
      inspections: [...current.inspections, inspectionData],
    };
    updateReport(updated);
    setWizardOpen(false);
    setExpandedIdx(updated.inspections.length - 1);
  }

  function removeInspection(idx) {
    if (!confirm('Remove this inspection entry?')) return;
    const current = reportRef.current;
    if (!current) return;
    const updated = {
      ...current,
      inspections: current.inspections.filter((_, i) => i !== idx),
    };
    updateReport(updated);
    setExpandedIdx(null);
  }

  if (!report) return null;

  const selectedRecipes = getRecipesByIds(report.selectedRecipeIds || []);

  function updateSelectedRecipes(ids) {
    const current = reportRef.current;
    if (!current) return;
    updateReport({ ...current, selectedRecipeIds: ids });
  }

  return (
    <div className="page inspect-page">
      <div className="step-indicator">
        <span className="step done">1. Shift Info</span>
        <span className="step active">2. Inspections</span>
        <span className="step">3. Review</span>
      </div>

      <div className="card">
        <div className="active-recipes-header">
          <h3>Products Running ({selectedRecipes.length})</h3>
          <button className="btn btn-sm btn-outline" onClick={() => setShowRecipePicker(v => !v)}>
            {showRecipePicker ? 'Done' : '+ Add Recipe'}
          </button>
        </div>
        {selectedRecipes.length > 0 ? (
          <div className="active-recipe-chips">
            {selectedRecipes.map(r => (
              <span key={r.id} className="active-recipe-chip">
                {r.name}
                <button
                  className="chip-remove"
                  onClick={() => updateSelectedRecipes((report.selectedRecipeIds || []).filter(x => x !== r.id))}
                >×</button>
              </span>
            ))}
          </div>
        ) : (
          <p className="field-hint">No products selected. Add the recipe(s) you are running so scans can be verified.</p>
        )}
        {showRecipePicker && (
          <div style={{ marginTop: 12 }}>
            <RecipeSelector
              selectedIds={report.selectedRecipeIds || []}
              onChange={updateSelectedRecipes}
            />
          </div>
        )}
      </div>

      <div className="card">
        <h2>Package Inspections</h2>
        <div className="alert alert-info">
          Every 30 minutes: the guided wizard walks you through scanning, rotating, and photographing each product.
          <br /><br />
          <strong>FULL SECONDARY PKG TEAR DOWN required at the TOP OF EACH HOUR</strong>
        </div>

        <button className="btn btn-primary btn-lg btn-add-inspection" onClick={() => setWizardOpen(true)}>
          + Start 30-Min Inspection
        </button>

        {report.inspections.length === 0 && (
          <div className="empty-state">
            <p>No inspections yet. Tap the button above to start your first guided inspection.</p>
          </div>
        )}

        {report.inspections.map((ins, idx) => (
          <div key={idx} className={`inspection-entry ${expandedIdx === idx ? 'expanded' : ''}`}>
            <div
              className="inspection-header"
              onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
            >
              <div className="inspection-summary">
                <span className="inspection-number">#{idx + 1}</span>
                <span className="inspection-time">{ins.time}</span>
                {ins.canRecipeMatch && (
                  <span className="badge badge-success">{ins.canRecipeMatch}</span>
                )}
                <span className={`badge ${ins.canBarcode && ins.rotationPhotos?.length >= 4 && ins.pkgBarcode ? 'badge-success' : 'badge-warning'}`}>
                  {ins.canBarcode && ins.rotationPhotos?.length >= 4 && ins.pkgBarcode ? 'Complete' : 'Partial'}
                </span>
              </div>
              <span className="expand-arrow">{expandedIdx === idx ? '▼' : '▶'}</span>
            </div>

            {expandedIdx === idx && (
              <div className="inspection-body">
                <div className="inspection-detail-grid">
                  <div className="inspection-detail">
                    <span className="detail-label">Can Barcode</span>
                    <span className="detail-value code-cell">{ins.canBarcode || '—'}</span>
                    {ins.canRecipeMatch ? (
                      <span className="match-result match-success">Match: {ins.canRecipeMatch}</span>
                    ) : ins.canBarcode ? (
                      <span className="match-result match-fail">No Match</span>
                    ) : null}
                  </div>

                  <div className="inspection-detail">
                    <span className="detail-label">Package Barcode</span>
                    <span className="detail-value code-cell">{ins.pkgBarcode || '—'}</span>
                    {ins.pkgRecipeMatch ? (
                      <span className="match-result match-success">Match: {ins.pkgRecipeMatch}</span>
                    ) : ins.pkgBarcode ? (
                      <span className="match-result match-fail">No Match</span>
                    ) : null}
                  </div>

                  <div className="inspection-detail">
                    <span className="detail-label">Date Code</span>
                    <span className="detail-value">{ins.dateCode || (ins.dateCodePhoto ? 'Photo taken' : '—')}</span>
                  </div>

                  {ins.dateCodeMonth && (
                    <div className="inspection-detail">
                      <span className="detail-label">Best By</span>
                      <span className="detail-value">
                        {ins.dateCodeMonth} {ins.dateCodeExpDay || ''}{ins.dateCodeExpYear ? `, 20${ins.dateCodeExpYear}` : ''}
                      </span>
                    </div>
                  )}

                  {(ins.dateCodeProdDay || ins.dateCodeTime || ins.dateCodeLine) && (
                    <div className="inspection-detail">
                      <span className="detail-label">Production</span>
                      <span className="detail-value">
                        {ins.dateCodeProdDayName || ins.dateCodeProdDay || ''}
                        {ins.dateCodeTime ? ` @ ${ins.dateCodeTime}` : ''}
                        {ins.dateCodeLine ? ` · Line ${ins.dateCodeLine}` : ''}
                      </span>
                    </div>
                  )}

                  <div className="inspection-detail">
                    <span className="detail-label">Condition</span>
                    <span className="detail-value">{ins.packageCondition || '—'}</span>
                  </div>
                </div>

                {ins.rotationPhotos && ins.rotationPhotos.length > 0 && (
                  <div className="inspection-photos">
                    <span className="detail-label">Rotation Photos ({ins.rotationPhotos.length})</span>
                    <div className="photo-thumb-grid">
                      {ins.rotationPhotos.map((photo, i) => (
                        <img key={i} src={photo} alt={`Rotation ${i + 1}`} className="photo-thumb" />
                      ))}
                    </div>
                  </div>
                )}

                {ins.pkgPhoto && (
                  <div className="inspection-photos">
                    <span className="detail-label">Package Photo</span>
                    <img src={ins.pkgPhoto} alt="Package" className="photo-thumb photo-thumb-lg" />
                  </div>
                )}

                {ins.dateCodePhoto && (
                  <div className="inspection-photos">
                    <span className="detail-label">Date Code Photo</span>
                    <img src={ins.dateCodePhoto} alt="Date code" className="photo-thumb photo-thumb-lg" />
                  </div>
                )}

                {ins.notes && (
                  <div className="inspection-detail">
                    <span className="detail-label">Notes</span>
                    <span className="detail-value">{ins.notes}</span>
                  </div>
                )}

                <button className="btn btn-sm btn-danger" onClick={() => removeInspection(idx)} style={{ marginTop: 12 }}>
                  Remove Inspection
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="page-actions">
        <button className="btn btn-outline" onClick={() => navigate(`/report/${id}/setup`)}>
          ← Back
        </button>
        <button className="btn btn-primary" onClick={() => navigate(`/report/${id}/review`)}>
          Next: Review & Submit →
        </button>
      </div>

      {wizardOpen && (
        <InspectionWizard
          selectedRecipes={selectedRecipes}
          onComplete={handleWizardComplete}
          onCancel={() => setWizardOpen(false)}
        />
      )}
    </div>
  );
}
