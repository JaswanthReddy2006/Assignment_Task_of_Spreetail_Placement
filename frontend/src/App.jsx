import React, { useState, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Import from './pages/Import';
import Groups from './pages/Groups';
import AddExpense from './pages/AddExpense';
import Login from './pages/Login';

export const UserContext = createContext(null);

function Sidebar() {
  const location = useLocation();
  const { user, setUser } = useContext(UserContext);

  const links = [
    { path: '/', label: 'Dashboard', icon: '📊' },
    { path: '/import', label: 'Import CSV', icon: '📥' },
    { path: '/add-expense', label: 'Add Expense', icon: '➕' },
    { path: '/groups', label: 'Groups', icon: '👥' },
  ];

  return (
    <aside className="sidebar">
      <div className="brand">FairShare</div>
      <div className="nav-links">
        {links.map(link => (
          <Link
            key={link.path}
            to={link.path}
            className={location.pathname === link.path ? 'active' : ''}
          >
            <span className="icon">{link.icon}</span>
            {link.label}
          </Link>
        ))}
      </div>
      {user && (
        <div className="user-info">
          <div className="user-avatar">{user.charAt(0)}</div>
          <div>
            <div className="user-name">{user}</div>
            <button
              onClick={() => setUser(null)}
              style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

function ProtectedRoute({ children }) {
  const { user } = useContext(UserContext);
  if (!user) return <Navigate to="/login" />;
  return children;
}

function AppContent() {
  const { user } = useContext(UserContext);
  const location = useLocation();

  if (location.pathname === '/login' || !user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    );
  }

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/import" element={<ProtectedRoute><Import /></ProtectedRoute>} />
          <Route path="/add-expense" element={<ProtectedRoute><AddExpense /></ProtectedRoute>} />
          <Route path="/groups" element={<ProtectedRoute><Groups /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(localStorage.getItem('fairshare_user') || null);

  const setUserAndSave = (name) => {
    if (name) {
      localStorage.setItem('fairshare_user', name);
    } else {
      localStorage.removeItem('fairshare_user');
    }
    setUser(name);
  };

  return (
    <UserContext.Provider value={{ user, setUser: setUserAndSave }}>
      <Router>
        <AppContent />
      </Router>
    </UserContext.Provider>
  );
}

export default App;
