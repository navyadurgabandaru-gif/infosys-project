import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { loginWithGoogleToken, homePathFor } = useAuth();
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    const token = searchParams.get('token');

    if (!token) {
      setErrorMessage('No token provided in URL redirect.');
      return;
    }

    loginWithGoogleToken(token)
      .then((user) => {
        const targetPath = homePathFor(user?.role);
        navigate(targetPath, { replace: true });
      })
      .catch((err) => {
        console.error('Google Auth Error:', err);
        // Catch exact error details from response or network
        const msg =
          err.response?.data?.message ||
          err.message ||
          'Failed to communicate with authentication server.';
        setErrorMessage(msg);
      });
  }, [searchParams, navigate, loginWithGoogleToken, homePathFor]);

  if (errorMessage) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
        <div style={{ textAlign: 'center', maxWidth: '400px', padding: '20px', border: '1px solid #ff4d4f', borderRadius: '8px', background: '#fff2f0' }}>
          <h3 style={{ color: '#cf1322' }}>Google Sign-In Failed</h3>
          <p style={{ color: '#434343', fontSize: '14px' }}>{errorMessage}</p>
          <button
            onClick={() => navigate('/login', { replace: true })}
            style={{ marginTop: '10px', padding: '8px 16px', background: '#1890ff', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
      <h2>Completing Google Sign-In...</h2>
    </div>
  );
}
