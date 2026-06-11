import { useNavigate, useLocation } from 'react-router-dom';

// Bump this on each release so you can confirm the live site updated.
export const APP_VERSION = 'v1.4 · smart date code';

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === '/';

  return (
    <header className="app-header">
      <div className="header-content">
        {!isHome && (
          <button className="btn btn-sm btn-back" onClick={() => navigate(-1)}>
            ← Back
          </button>
        )}
        <h1 className="header-title" onClick={() => navigate('/')}>
          Swire Line Packer Report
        </h1>
        <span className="header-version">{APP_VERSION}</span>
      </div>
    </header>
  );
}
