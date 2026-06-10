import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Home from './pages/Home';
import ShiftSetup from './pages/ShiftSetup';
import UPCTest from './pages/UPCTest';
import Inspections from './pages/Inspections';
import Review from './pages/Review';
import Admin from './pages/Admin';

export default function App() {
  return (
    <Router>
      <Header />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/report/:id/setup" element={<ShiftSetup />} />
          <Route path="/report/:id/upc" element={<UPCTest />} />
          <Route path="/report/:id/inspect" element={<Inspections />} />
          <Route path="/report/:id/review" element={<Review />} />
        </Routes>
      </main>
    </Router>
  );
}
