import { useNavigate, useLocation } from 'react-router-dom';

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
      </div>
    </header>
  );
}
