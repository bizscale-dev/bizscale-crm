'use client';

import { useActionState } from 'react';
import { login } from './actions';

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(login, { error: null });

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: 'linear-gradient(135deg, var(--background) 0%, rgba(22, 178, 147, 0.05) 100%)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Animated background elements */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(20px); }
        }
        
        @keyframes rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.1); }
        }
        
        @keyframes shimmer {
          0% { left: -1000px; }
          100% { left: 100%; }
        }
        
        .blob1 {
          position: absolute;
          width: 300px;
          height: 300px;
          background: radial-gradient(circle, rgba(22, 178, 147, 0.15) 0%, transparent 70%);
          border-radius: 50%;
          animation: float 6s ease-in-out infinite;
          top: -100px;
          left: -100px;
          z-index: 1;
        }
        
        .blob2 {
          position: absolute;
          width: 250px;
          height: 250px;
          background: radial-gradient(circle, rgba(22, 178, 147, 0.1) 0%, transparent 70%);
          border-radius: 50%;
          animation: float 8s ease-in-out infinite 1s;
          bottom: -50px;
          right: -50px;
          z-index: 1;
        }
        
        .blob3 {
          position: absolute;
          width: 200px;
          height: 200px;
          background: radial-gradient(circle, rgba(22, 178, 147, 0.08) 0%, transparent 70%);
          border-radius: 50%;
          animation: float 7s ease-in-out infinite 2s;
          top: 50%;
          right: 10%;
          z-index: 1;
        }
        
        .line-decoration {
          position: absolute;
          background: linear-gradient(90deg, transparent, rgba(22, 178, 147, 0.3), transparent);
          animation: shimmer 3s infinite;
          z-index: 1;
        }
        
        .line1 {
          width: 200%;
          height: 1px;
          top: 20%;
          left: -50%;
        }
        
        .line2 {
          width: 200%;
          height: 1px;
          top: 60%;
          left: -50%;
          animation: shimmer 4s infinite 1s;
        }
        
        .dot {
          position: absolute;
          width: 8px;
          height: 8px;
          background: rgba(22, 178, 147, 0.6);
          border-radius: 50%;
          animation: pulse 3s ease-in-out infinite;
          z-index: 1;
        }
        
        .dot1 {
          top: 15%;
          left: 10%;
          animation-delay: 0s;
        }
        
        .dot2 {
          top: 70%;
          left: 15%;
          animation-delay: 0.5s;
        }
        
        .dot3 {
          top: 30%;
          right: 20%;
          animation-delay: 1s;
        }
        
        .dot4 {
          bottom: 20%;
          right: 10%;
          animation-delay: 1.5s;
        }
        
        .card-container {
          position: relative;
          z-index: 10;
        }
      `}</style>

      {/* Animated blobs */}
      <div className="blob1"></div>
      <div className="blob2"></div>
      <div className="blob3"></div>
      
      {/* Shimmer lines */}
      <div className="line-decoration line1"></div>
      <div className="line-decoration line2"></div>
      
      {/* Decorative dots */}
      <div className="dot dot1"></div>
      <div className="dot dot2"></div>
      <div className="dot dot3"></div>
      <div className="dot dot4"></div>

      {/* Login card */}
      <div className="card-container">
        <div className="card" style={{ 
          maxWidth: '680px', 
          width: '100%', 
          padding: '3rem 2.5rem',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
        }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <div style={{ marginBottom: '1.5rem' }}>
              <img 
                src="https://bizscale.pk/wp-content/uploads/2025/04/Bizscale-scaled.png" 
                alt="Bizscale"
                style={{ 
                  maxWidth: '160px', 
                  height: 'auto',
                  display: 'block',
                  margin: '0 auto'
                }}
              />
            </div>
           
            <p style={{ 
               color: '(0,0,0,0)',
              margin: 0,
              fontSize: '0.95rem',
              fontWeight: '400'
            }}>
              SEO Campaign Management
            </p>
          </div>

          {state?.error && (
            <div style={{
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              color: 'var(--danger)',
              padding: '1rem',
              borderRadius: '0.5rem',
              marginBottom: '1.5rem',
              border: '1px solid var(--danger)',
              fontSize: '0.9rem'
            }}>
              {state.error}
            </div>
          )}

          <form action={formAction}>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '0.625rem', 
                color: 'var(--text-muted)',
                fontSize: '0.9rem',
                fontWeight: '500'
              }}>
                Email Address
              </label>
              <input
                type="email"
                name="email"
                required
                placeholder="you@example.com"
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  borderRadius: '0.5rem',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--background)',
                  color: 'var(--foreground)',
                  boxSizing: 'border-box',
                  fontSize: '0.95rem',
                  transition: 'border-color 0.2s, box-shadow 0.2s'
                }}
              />
            </div>

            <div style={{ marginBottom: '1.75rem' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '0.625rem', 
                color: 'var(--text-muted)',
                fontSize: '0.9rem',
                fontWeight: '500'
              }}>
                Password
              </label>
              <input
                type="password"
                name="password"
                required
                placeholder="••••••••"
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  borderRadius: '0.5rem',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--background)',
                  color: 'var(--foreground)',
                  boxSizing: 'border-box',
                  fontSize: '0.95rem',
                  transition: 'border-color 0.2s, box-shadow 0.2s'
                }}
              />
            </div>

            <button
              type="submit"
              disabled={isPending}
              style={{ 
                width: '100%', 
                padding: '1rem', 
                fontSize: '1rem',
                fontWeight: '600',
                transition: 'all 0.3s',
                backgroundColor: '#16b293',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer'
              }}
            >
              {isPending ? 'Signing In...' : 'Sign In'}
            </button>
          </form>
         
        
        </div>
      </div>
    </div>
  );
}
