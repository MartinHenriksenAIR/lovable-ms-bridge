"use client";

import React, { useState } from "react";
import SignatureCanvas from "@/components/SignatureCanvas";

export default function TestSignaturePage() {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  return (
    <div
      style={{
        maxWidth: 600,
        margin: "40px auto",
        padding: 20,
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>
        Test: Ink Mark Capture
      </h1>

      <p style={{ marginBottom: 16, fontSize: 14, color: "#555" }}>
        Draw a mark below. When you click &quot;Use this mark&quot;, we capture
        it as a PNG image.
      </p>

      <SignatureCanvas onChange={setDataUrl} />

      {dataUrl && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>Preview of your mark</h2>
          <img
            src={dataUrl}
            alt="Ink mark preview"
            style={{
              border: "1px solid #ddd",
              borderRadius: 4,
              maxWidth: "100%",
              background: "white",
            }}
          />
          <p style={{ fontSize: 12, color: "#777", marginTop: 8 }}>
            This preview is rendered from the{" "}
            <code style={{ fontSize: 12 }}>data:image/png;base64,...</code>{" "}
            string that we will send to the backend.
          </p>
        </div>
      )}
    </div>
  );
}
