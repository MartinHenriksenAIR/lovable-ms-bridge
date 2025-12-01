"use client";

import React, { useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";

type SignatureCanvasProps = {
  onChange?: (dataUrl: string | null) => void;
};

export default function SignatureCanvas({ onChange }: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sigPadRef = useRef<SignaturePad | null>(null);

  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;

    // Retina scaling
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;

    const ctx = canvas.getContext("2d");
    if (ctx) ctx.scale(ratio, ratio);

    const pad = new SignaturePad(canvas, {
      backgroundColor: "white",
      penColor: "black",
    });

    sigPadRef.current = pad;

    // --- FIX: proper event listeners ---
    const handleBegin = () => setHasDrawn(true);
    pad.addEventListener("beginStroke", handleBegin);

    // Cleanup
    return () => {
      pad.removeEventListener("beginStroke", handleBegin);
      sigPadRef.current = null;
    };
  }, []);

  function handleClear() {
    if (!sigPadRef.current) return;
    sigPadRef.current.clear();
    setHasDrawn(false);
    onChange?.(null);
  }

  function handleUndo() {
    if (!sigPadRef.current) return;
    const pad = sigPadRef.current;
    const data = pad.toData();
    if (data.length === 0) return;

    data.pop();
    pad.fromData(data);

    if (data.length === 0) {
      setHasDrawn(false);
      onChange?.(null);
    }
  }

  function handleUseMark() {
    if (!sigPadRef.current) return;
    const pad = sigPadRef.current;

    if (pad.isEmpty()) {
      alert("Please draw a mark before continuing.");
      return;
    }

    const dataUrl = pad.toDataURL("image/png");
    onChange?.(dataUrl);
  }

  return (
    <div
      style={{
        padding: 16,
        border: "1px solid #ddd",
        borderRadius: 8,
        background: "#f9fafb",
      }}
    >
      <p style={{ fontSize: 14, marginBottom: 8 }}>
        Draw your mark in the area below:
      </p>

      <div
        style={{
          border: "1px dashed #999",
          borderRadius: 6,
          background: "white",
          width: "100%",
          height: 150,
          overflow: "hidden",
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            display: "block",
            width: "100%",
            height: "150px",
            touchAction: "none",
          }}
        />
      </div>

      <div
        style={{
          marginTop: 12,
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={handleClear}>
            Clear
          </button>
          <button type="button" onClick={handleUndo}>
            Undo
          </button>
        </div>

        <button
          type="button"
          disabled={!hasDrawn}
          onClick={handleUseMark}
          style={{ opacity: hasDrawn ? 1 : 0.5 }}
        >
          Use this mark
        </button>
      </div>
    </div>
  );
}
