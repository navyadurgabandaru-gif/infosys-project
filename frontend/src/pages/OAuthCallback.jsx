import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { loginWithGoogleToken, homePathFor } = useAuth();

  useEffect(() => {
    const token = searchParams.get('token');

    if (!token) {
      navigate('/login?error=no_token', { replace: true });
      return;
    }

    loginWithGoogleToken(token)
      .then((user) => {
        const targetPath = homePathFor(user.role);
        navigate(targetPath, { replace: true });
      })
      .catch(() => {
        navigate('/login?error=auth_failed', { replace: true });
      });
  }, [searchParams, navigate, loginWithGoogleToken, homePathFor]);

  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100vh' }}>
      <h2>Completing Google Sign-In...</h2>
    </div>
  );
}
