import { lazy, Suspense } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Home from './pages/Home';
import ShiftSetup from './pages/ShiftSetup';
import Inspections from './pages/Inspections';
import Review from './pages/Review';
import Admin from './pages/Admin';

const VisionTest = lazy(() => import('./pages/VisionTest'));

export default function App() {
  return (
    <Router>
      <Header />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/admin" element={<Admin />} />
          <Route
            path="/vision"
            element={
              <Suspense fallback={<div className="page"><div className="card"><p>Loading camera recognition…</p></div></div>}>
                <VisionTest />
              </Suspense>
            }
          />
          <Route path="/report/:id/setup" element={<ShiftSetup />} />
          <Route path="/report/:id/inspect" element={<Inspections />} />
          <Route path="/report/:id/review" element={<Review />} />
        </Routes>
      </main>
    </Router>
  );
}
