import '@tensorflow/tfjs';
import * as mobilenet from '@tensorflow-models/mobilenet';

let modelPromise = null;

export function loadModel() {
  if (!modelPromise) {
    modelPromise = mobilenet.load({ version: 2, alpha: 1.0 });
  }
  return modelPromise;
}

// ImageNet labels that indicate a can or a bottle
const CAN_LABELS = ['beer can', 'can opener, tin opener', 'milk can', 'tin can'];
const BOTTLE_LABELS = [
  'pop bottle, soda bottle',
  'water bottle',
  'beer bottle',
  'wine bottle',
  'pill bottle',
  'whiskey jug',
];

function labelType(label) {
  const l = label.toLowerCase();
  if (CAN_LABELS.some(c => l.includes(c.split(',')[0]))) return 'can';
  if (BOTTLE_LABELS.some(b => l.includes(b.split(',')[0]))) return 'bottle';
  if (l.includes(' can') || l.startsWith('can')) return 'can';
  if (l.includes('bottle')) return 'bottle';
  return null;
}

// Classify a video/canvas/image element. Returns { type, confidence, predictions }
export async function classifyFrame(el) {
  const model = await loadModel();
  const predictions = await model.classify(el, 5);

  let canScore = 0;
  let bottleScore = 0;
  for (const p of predictions) {
    const t = labelType(p.className);
    if (t === 'can') canScore += p.probability;
    if (t === 'bottle') bottleScore += p.probability;
  }

  let type = 'unknown';
  let confidence = predictions[0]?.probability || 0;
  if (canScore > 0.15 || bottleScore > 0.15) {
    type = canScore >= bottleScore ? 'can' : 'bottle';
    confidence = Math.max(canScore, bottleScore);
  }

  return { type, confidence, predictions };
}

// Get a normalized feature embedding for visual similarity matching
export async function getEmbedding(el) {
  const model = await loadModel();
  const t = model.infer(el, true);
  const data = await t.data();
  t.dispose();
  // L2 normalize
  let norm = 0;
  for (let i = 0; i < data.length; i++) norm += data[i] * data[i];
  norm = Math.sqrt(norm) || 1;
  const out = new Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i] / norm;
  return out;
}

export function cosineSimilarity(a, b) {
  let dot = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot;
}

// ---- Reference product store (for promo vs regular differentiation) ----

const REFS_KEY = 'swire_vision_refs';

export function getReferences() {
  try {
    return JSON.parse(localStorage.getItem(REFS_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveReference(ref) {
  const refs = getReferences();
  const idx = refs.findIndex(r => r.id === ref.id);
  if (idx >= 0) refs[idx] = ref;
  else refs.push(ref);
  localStorage.setItem(REFS_KEY, JSON.stringify(refs));
}

export function deleteReference(id) {
  localStorage.setItem(REFS_KEY, JSON.stringify(getReferences().filter(r => r.id !== id)));
}

export function createReference(name, type) {
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name,
    type, // 'can' | 'bottle' | 'wrap'
    embeddings: [],
    createdAt: new Date().toISOString(),
  };
}

// Compare an embedding against all references.
// Returns ranked [{ref, score}] where score is the best cosine similarity
// across that reference's stored angles.
export function matchAgainstReferences(embedding, refs = getReferences()) {
  const results = refs
    .filter(r => r.embeddings.length > 0)
    .map(ref => {
      let best = -1;
      for (const e of ref.embeddings) {
        const s = cosineSimilarity(embedding, e);
        if (s > best) best = s;
      }
      return { ref, score: best };
    })
    .sort((a, b) => b.score - a.score);
  return results;
}
