'use client';

import { useActionState, useState, useEffect } from 'react';
import { login } from './actions';

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(login, { error: null });
  const [showPassword, setShowPassword] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (!state?.error) return;
    // Deferred (not called synchronously in the effect body) so the shake
    // class re-applies even if the same error text repeats back-to-back.
    const raf = requestAnimationFrame(() => setShake(true));
    const t = setTimeout(() => setShake(false), 500);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
  }, [state?.error]);

  return (
    <div className="login-page">
      <style>{`
        @keyframes meshFloat1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(40px, -30px) scale(1.1); }
        }
        @keyframes meshFloat2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-30px, 40px) scale(1.15); }
        }
        @keyframes meshFloat3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(30px, 30px) scale(0.9); }
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes shakeX {
          10%, 90% { transform: translateX(-2px); }
          20%, 80% { transform: translateX(4px); }
          30%, 50%, 70% { transform: translateX(-8px); }
          40%, 60% { transform: translateX(8px); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .login-page {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 1.1fr 1fr;
          background: var(--background);
        }
        @media (max-width: 900px) {
          .login-page { grid-template-columns: 1fr; }
          .login-brand-panel { display: none; }
        }

        .login-brand-panel {
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 4rem;
          background: linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%);
          color: white;
        }
        .mesh-blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(10px);
          opacity: 0.35;
        }
        .mesh-blob.b1 {
          width: 420px; height: 420px; top: -120px; left: -120px;
          background: radial-gradient(circle, rgba(255,255,255,0.5) 0%, transparent 70%);
          animation: meshFloat1 9s ease-in-out infinite;
        }
        .mesh-blob.b2 {
          width: 360px; height: 360px; bottom: -100px; right: -80px;
          background: radial-gradient(circle, rgba(255,255,255,0.4) 0%, transparent 70%);
          animation: meshFloat2 11s ease-in-out infinite;
        }
        .mesh-blob.b3 {
          width: 260px; height: 260px; top: 40%; left: 20%;
          background: radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%);
          animation: meshFloat3 8s ease-in-out infinite;
        }
        .mesh-grid {
          position: absolute;
          inset: 0;
          background-image: radial-gradient(rgba(255,255,255,0.15) 1px, transparent 1px);
          background-size: 28px 28px;
          opacity: 0.4;
        }

        .login-form-panel {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
        }
        .login-form-card {
          width: 100%;
          max-width: 400px;
          animation: fadeSlideUp 0.6s ease 0.1s both;
        }

        .field-group {
          position: relative;
          margin-bottom: 1.4rem;
        }
        .field-icon {
          position: absolute;
          left: 0.9rem;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
          pointer-events: none;
          display: flex;
        }
        .field-input {
          width: 100%;
          padding: 1.1rem 0.9rem 0.5rem 2.6rem;
          border-radius: 0.6rem;
          border: 1.5px solid var(--border);
          background-color: var(--background);
          color: var(--foreground);
          box-sizing: border-box;
          font-size: 0.95rem;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .field-input:focus {
          border-color: var(--primary);
          box-shadow: 0 0 0 3px rgba(22, 178, 147, 0.15);
        }
        .field-label {
          position: absolute;
          left: 2.6rem;
          top: 0.85rem;
          color: var(--text-muted);
          font-size: 0.95rem;
          pointer-events: none;
          transition: all 0.15s ease;
          transform-origin: left top;
        }
        .field-input:focus + .field-label,
        .field-input:not(:placeholder-shown) + .field-label {
          top: 0.3rem;
          font-size: 0.7rem;
          color: var(--primary);
          transform: none;
        }
        .field-toggle {
          position: absolute;
          right: 0.75rem;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          color: var(--text-muted);
          padding: 0.3rem;
          display: flex;
        }
        .field-toggle:hover { color: var(--primary); }

        .login-error {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          background-color: rgba(239, 68, 68, 0.1);
          color: var(--danger);
          padding: 0.85rem 1rem;
          border-radius: 0.5rem;
          margin-bottom: 1.25rem;
          border: 1px solid var(--danger);
          font-size: 0.875rem;
        }
        .login-error.shake { animation: shakeX 0.5s ease; }

        .login-submit {
          width: 100%;
          padding: 0.95rem;
          font-size: 0.95rem;
          font-weight: 600;
          background-color: var(--primary);
          color: white;
          border: none;
          border-radius: 0.6rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.6rem;
          transition: background-color 0.2s, transform 0.1s;
        }
        .login-submit:hover:not(:disabled) { background-color: var(--primary-hover); transform: translateY(-1px); }
        .login-submit:active:not(:disabled) { transform: translateY(0); }
        .login-submit:disabled { opacity: 0.75; cursor: not-allowed; }
        .spinner {
          width: 16px; height: 16px;
          border: 2px solid rgba(255,255,255,0.4);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        /* 3D "building blocks" loader (adapted from a Uiverse.io community
           snippet), recolored to the brand teal via --primary/--primary-light
           instead of its original blue. Class names prefixed bc- (not just
           .loader/.box/.ground) since this <style> tag is unscoped global
           CSS, to keep it from ever colliding with another component's
           class names. Entrance/glow treatment below the pasted keyframes
           is the extra flourish on top of it. */
        .bc-stage {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: fadeIn 0.8s ease both;
        }
        @keyframes bc-glow-pulse {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.15); opacity: 0.8; }
        }
        .bc-glow {
          position: absolute;
          width: 320px;
          height: 320px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255,255,255,0.25) 0%, transparent 70%);
          filter: blur(20px);
          animation: bc-glow-pulse 4s ease-in-out infinite;
        }

        .bc-loader {
          --duration: 3s;
          --primary: var(--primary-hover);
          --primary-light: #ffffff;
          --primary-rgba: rgba(255, 255, 255, 0);
          width: 200px;
          height: 320px;
          position: relative;
          transform-style: preserve-3d;
          z-index: 1;
        }
        @media (max-width: 480px) {
          .bc-loader { zoom: 0.6; }
        }
        .bc-loader:before, .bc-loader:after {
          --r: 20.5deg;
          content: "";
          width: 320px;
          height: 140px;
          position: absolute;
          right: 32%;
          bottom: -11px;
          background: var(--primary-hover);
          transform: translateZ(200px) rotate(var(--r));
          animation: bc-mask var(--duration) linear forwards infinite;
        }
        .bc-loader:after {
          --r: -20.5deg;
          right: auto;
          left: 32%;
        }
        .bc-ground {
          position: absolute;
          left: -50px;
          bottom: -120px;
          transform-style: preserve-3d;
          transform: rotateY(-47deg) rotateX(-15deg) rotateZ(15deg) scale(1);
        }
        .bc-ground div {
          transform: rotateX(90deg) rotateY(0deg) translate(-48px, -120px) translateZ(100px) scale(0);
          width: 200px;
          height: 200px;
          background: linear-gradient(45deg, var(--primary) 0%, var(--primary) 50%, var(--primary-light) 50%, var(--primary-light) 100%);
          transform-style: preserve-3d;
          animation: bc-ground var(--duration) linear forwards infinite;
        }
        .bc-ground div:before, .bc-ground div:after {
          --rx: 90deg;
          --ry: 0deg;
          --x: 44px;
          --y: 162px;
          --z: -50px;
          content: "";
          width: 156px;
          height: 300px;
          opacity: 0;
          background: linear-gradient(var(--primary), var(--primary-rgba));
          position: absolute;
          transform: rotateX(var(--rx)) rotateY(var(--ry)) translate(var(--x), var(--y)) translateZ(var(--z));
          animation: bc-ground-shine var(--duration) linear forwards infinite;
        }
        .bc-ground div:after {
          --rx: 90deg;
          --ry: 90deg;
          --x: 0;
          --y: 177px;
          --z: 150px;
        }
        .bc-box {
          --x: 0;
          --y: 0;
          position: absolute;
          animation: var(--duration) linear forwards infinite;
          transform: translate(var(--x), var(--y));
        }
        .bc-box div {
          background-color: var(--primary);
          width: 48px;
          height: 48px;
          position: relative;
          transform-style: preserve-3d;
          animation: var(--duration) ease forwards infinite;
          transform: rotateY(-47deg) rotateX(-15deg) rotateZ(15deg) scale(0);
        }
        .bc-box div:before, .bc-box div:after {
          --rx: 90deg;
          --ry: 0deg;
          --z: 24px;
          --y: -24px;
          --x: 0;
          content: "";
          position: absolute;
          background-color: inherit;
          width: inherit;
          height: inherit;
          transform: rotateX(var(--rx)) rotateY(var(--ry)) translate(var(--x), var(--y)) translateZ(var(--z));
          filter: brightness(var(--b, 1.2));
        }
        .bc-box div:after {
          --rx: 0deg;
          --ry: 90deg;
          --x: 24px;
          --y: 0;
          --b: 1.4;
        }
        .bc-box.b0 { --x: -220px; --y: -120px; left: 58px; top: 108px; animation-name: bc-move0; }
        .bc-box.b0 div { animation-name: bc-scale0; }
        .bc-box.b1 { --x: -260px; --y: 120px; left: 25px; top: 120px; animation-name: bc-move1; }
        .bc-box.b1 div { animation-name: bc-scale1; }
        .bc-box.b2 { --x: 120px; --y: -190px; left: 58px; top: 64px; animation-name: bc-move2; }
        .bc-box.b2 div { animation-name: bc-scale2; }
        .bc-box.b3 { --x: 280px; --y: -40px; left: 91px; top: 120px; animation-name: bc-move3; }
        .bc-box.b3 div { animation-name: bc-scale3; }
        .bc-box.b4 { --x: 60px; --y: 200px; left: 58px; top: 132px; animation-name: bc-move4; }
        .bc-box.b4 div { animation-name: bc-scale4; }
        .bc-box.b5 { --x: -220px; --y: -120px; left: 25px; top: 76px; animation-name: bc-move5; }
        .bc-box.b5 div { animation-name: bc-scale5; }
        .bc-box.b6 { --x: -260px; --y: 120px; left: 91px; top: 76px; animation-name: bc-move6; }
        .bc-box.b6 div { animation-name: bc-scale6; }
        .bc-box.b7 { --x: -240px; --y: 200px; left: 58px; top: 87px; animation-name: bc-move7; }
        .bc-box.b7 div { animation-name: bc-scale7; }

        @keyframes bc-move0 { 12% { transform: translate(var(--x), var(--y)); } 25%, 52% { transform: translate(0, 0); } 80% { transform: translate(0, -32px); } 90%, 100% { transform: translate(0, 188px); } }
        @keyframes bc-scale0 { 6% { transform: rotateY(-47deg) rotateX(-15deg) rotateZ(15deg) scale(0); } 14%, 100% { transform: rotateY(-47deg) rotateX(-15deg) rotateZ(15deg) scale(1); } }
        @keyframes bc-move1 { 16% { transform: translate(var(--x), var(--y)); } 29%, 52% { transform: translate(0, 0); } 80% { transform: translate(0, -32px); } 90%, 100% { transform: translate(0, 188px); } }
        @keyframes bc-scale1 { 10% { transform: rotateY(-47deg) rotateX(-15deg) rotateZ(15deg) scale(0); } 18%, 100% { transform: rotateY(-47deg) rotateX(-15deg) rotateZ(15deg) scale(1); } }
        @keyframes bc-move2 { 20% { transform: translate(var(--x), var(--y)); } 33%, 52% { transform: translate(0, 0); } 80% { transform: translate(0, -32px); } 90%, 100% { transform: translate(0, 188px); } }
        @keyframes bc-scale2 { 14% { transform: rotateY(-47deg) rotateX(-15deg) rotateZ(15deg) scale(0); } 22%, 100% { transform: rotateY(-47deg) rotateX(-15deg) rotateZ(15deg) scale(1); } }
        @keyframes bc-move3 { 24% { transform: translate(var(--x), var(--y)); } 37%, 52% { transform: translate(0, 0); } 80% { transform: translate(0, -32px); } 90%, 100% { transform: translate(0, 188px); } }
        @keyframes bc-scale3 { 18% { transform: rotateY(-47deg) rotateX(-15deg) rotateZ(15deg) scale(0); } 26%, 100% { transform: rotateY(-47deg) rotateX(-15deg) rotateZ(15deg) scale(1); } }
        @keyframes bc-move4 { 28% { transform: translate(var(--x), var(--y)); } 41%, 52% { transform: translate(0, 0); } 80% { transform: translate(0, -32px); } 90%, 100% { transform: translate(0, 188px); } }
        @keyframes bc-scale4 { 22% { transform: rotateY(-47deg) rotateX(-15deg) rotateZ(15deg) scale(0); } 30%, 100% { transform: rotateY(-47deg) rotateX(-15deg) rotateZ(15deg) scale(1); } }
        @keyframes bc-move5 { 32% { transform: translate(var(--x), var(--y)); } 45%, 52% { transform: translate(0, 0); } 80% { transform: translate(0, -32px); } 90%, 100% { transform: translate(0, 188px); } }
        @keyframes bc-scale5 { 26% { transform: rotateY(-47deg) rotateX(-15deg) rotateZ(15deg) scale(0); } 34%, 100% { transform: rotateY(-47deg) rotateX(-15deg) rotateZ(15deg) scale(1); } }
        @keyframes bc-move6 { 36% { transform: translate(var(--x), var(--y)); } 49%, 52% { transform: translate(0, 0); } 80% { transform: translate(0, -32px); } 90%, 100% { transform: translate(0, 188px); } }
        @keyframes bc-scale6 { 30% { transform: rotateY(-47deg) rotateX(-15deg) rotateZ(15deg) scale(0); } 38%, 100% { transform: rotateY(-47deg) rotateX(-15deg) rotateZ(15deg) scale(1); } }
        @keyframes bc-move7 { 40% { transform: translate(var(--x), var(--y)); } 53%, 52% { transform: translate(0, 0); } 80% { transform: translate(0, -32px); } 90%, 100% { transform: translate(0, 188px); } }
        @keyframes bc-scale7 { 34% { transform: rotateY(-47deg) rotateX(-15deg) rotateZ(15deg) scale(0); } 42%, 100% { transform: rotateY(-47deg) rotateX(-15deg) rotateZ(15deg) scale(1); } }
        @keyframes bc-ground {
          0%, 65% { transform: rotateX(90deg) rotateY(0deg) translate(-48px, -120px) translateZ(100px) scale(0); }
          75%, 90% { transform: rotateX(90deg) rotateY(0deg) translate(-48px, -120px) translateZ(100px) scale(1); }
          100% { transform: rotateX(90deg) rotateY(0deg) translate(-48px, -120px) translateZ(100px) scale(0); }
        }
        @keyframes bc-ground-shine {
          0%, 70% { opacity: 0; }
          75%, 87% { opacity: 0.2; }
          100% { opacity: 0; }
        }
        @keyframes bc-mask {
          0%, 65% { opacity: 0; }
          66%, 100% { opacity: 1; }
        }
      `}</style>

      {/* Left: branding panel */}
      <div className="login-brand-panel">
        <div className="mesh-grid" />
        <div className="mesh-blob b1" />
        <div className="mesh-blob b2" />
        <div className="mesh-blob b3" />

        <div className="bc-stage">
          <div className="bc-glow" />
          <div className="bc-loader">
            <div className="bc-ground"><div /></div>
            <div className="bc-box b0"><div /></div>
            <div className="bc-box b1"><div /></div>
            <div className="bc-box b2"><div /></div>
            <div className="bc-box b3"><div /></div>
            <div className="bc-box b4"><div /></div>
            <div className="bc-box b5"><div /></div>
            <div className="bc-box b6"><div /></div>
            <div className="bc-box b7"><div /></div>
          </div>
        </div>
      </div>

      {/* Right: form panel */}
      <div className="login-form-panel">
        <div className="login-form-card">
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <img
              src="https://bizscale.pk/wp-content/uploads/2025/04/Bizscale-scaled.png"
              alt="Bizscale"
              style={{ maxWidth: '150px', height: 'auto', display: 'block', margin: '0 auto 1rem' }}
            />
            <h2 style={{ fontSize: '1.4rem', margin: '0 0 0.35rem', fontWeight: 700 }}>Welcome back</h2>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>Sign in to your account to continue</p>
          </div>

          {state?.error && (
            <div className={`login-error${shake ? ' shake' : ''}`}>
              <span>⚠️</span>
              <span>{state.error}</span>
            </div>
          )}

          <form action={formAction}>
            <div className="field-group">
              <span className="field-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16v16H4z" opacity="0" />
                  <path d="M22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6z" />
                  <path d="m22 6-10 7L2 6" />
                </svg>
              </span>
              <input type="email" name="email" required placeholder=" " className="field-input" />
              <label className="field-label">Email Address</label>
            </div>

            <div className="field-group">
              <span className="field-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                required
                placeholder=" "
                className="field-input"
                style={{ paddingRight: '2.6rem' }}
              />
              <label className="field-label">Password</label>
              <button type="button" className="field-toggle" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>

            <button type="submit" disabled={isPending} className="login-submit">
              {isPending && <span className="spinner" />}
              {isPending ? 'Signing In...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
