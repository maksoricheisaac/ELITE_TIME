"use client";

export function GlobalErrorReset({ onReset }: { onReset?: () => void }) {
  return (
    <button
      type="button"
      onClick={() => (onReset ? onReset() : window.location.reload())}
      style={{
        background: "#0b84c6",
        color: "#fff",
        border: "none",
        borderRadius: "8px",
        padding: "0.625rem 1.5rem",
        fontSize: "0.875rem",
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      Réessayer
    </button>
  );
}
