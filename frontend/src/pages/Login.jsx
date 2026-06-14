import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserContext } from '../App';

const MEMBERS = ['Aisha', 'Rohan', 'Priya', 'Sam', 'Meera'];

export default function Login() {
  const { setUser } = useContext(UserContext);
  const navigate = useNavigate();

  const handleLogin = (name) => {
    setUser(name);
    navigate('/');
  };

  return (
    <div className="login-page">
      <div className="login-box">
        <h1>FairShare</h1>
        <p>Select your account to continue</p>
        <div className="login-options">
          {MEMBERS.map(name => (
            <button key={name} className="login-option" onClick={() => handleLogin(name)}>
              <div className="login-avatar">{name.charAt(0)}</div>
              <div>{name}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
