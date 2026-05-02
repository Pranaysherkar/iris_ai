"use client";

type Props = {
  open: boolean;
  email: string;
  onOkay: () => void;
};

export default function VerifyEmailModal({ open, email, onOkay }: Props) {
  if (!open) return null;

  const address = email.trim() || "your email address";

  return (
    <div className="verify-modal-root" role="presentation">
      <div className="verify-modal-backdrop" aria-hidden />
      <div
        className="verify-modal-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="verify-modal-title"
        aria-describedby="verify-modal-desc"
      >
        <div className="verify-modal-icon" aria-hidden>
          <MailOpenIcon />
        </div>
        <h2 id="verify-modal-title" className="verify-modal-title">
          Check your email
        </h2>
        <p id="verify-modal-desc" className="verify-modal-body">
          We sent a verification link to <strong>{address}</strong>. Open the email and tap{" "}
          <strong>Confirm</strong> to verify your account. After that you can sign in here with your
          email and password.
        </p>
        <button type="button" className="verify-modal-ok" onClick={onOkay}>
          Okay
        </button>
      </div>

      <style>{modalStyles}</style>
    </div>
  );
}

function MailOpenIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M22 12h-6l-2 3h-4l-2-3H2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const modalStyles = `
  .verify-modal-root {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .verify-modal-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(5, 5, 8, 0.72);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }
  .verify-modal-dialog {
    position: relative;
    width: 100%;
    max-width: 400px;
    padding: 28px 28px 24px;
    border-radius: 18px;
    background: rgba(22, 22, 28, 0.98);
    border: 1px solid rgba(255,255,255,0.1);
    box-shadow: 0 24px 80px rgba(0,0,0,0.65);
    text-align: center;
  }
  .verify-modal-icon {
    display: flex;
    justify-content: center;
    margin-bottom: 16px;
    color: #a78bfa;
  }
  .verify-modal-title {
    margin: 0 0 12px;
    font-size: 20px;
    font-weight: 600;
    color: #f1f1f3;
    letter-spacing: -0.3px;
  }
  .verify-modal-body {
    margin: 0 0 22px;
    font-size: 14px;
    line-height: 1.55;
    color: #9a9aae;
    text-align: left;
  }
  .verify-modal-body strong {
    color: #d4d4e8;
    font-weight: 600;
  }
  .verify-modal-ok {
    width: 100%;
    height: 44px;
    border: none;
    border-radius: 10px;
    background: linear-gradient(135deg, #7c6aff 0%, #9d8cff 100%);
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    letter-spacing: 0.02em;
    box-shadow: 0 4px 20px rgba(124,106,255,0.35);
    transition: opacity 0.2s, transform 0.15s;
  }
  .verify-modal-ok:hover {
    opacity: 0.94;
    transform: translateY(-1px);
  }
  .verify-modal-ok:active {
    transform: translateY(0);
  }
`;
