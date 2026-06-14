import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Import from './pages/Import';

function Nav() {
  const location = useLocation();
  return (
    <nav className="navbar">
      <div className="brand">FairShare</div>
      <div className="nav-links">
        <Link to="/" className={location.pathname === '/' ? 'active' : ''}>Dashboard</Link>
        <Link to="/import" className={location.pathname === '/import' ? 'active' : ''}>Import Data</Link>
      </div>
    </nav>
  );
}

function App() {
  return (
    <Router>
      <div className="container">
        <Nav />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/import" element={<Import />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
