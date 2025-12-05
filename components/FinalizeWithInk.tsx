"use client";

import React, { useState } from "react";
import SignatureCanvas from "@/components/SignatureCanvas";

type FinalizeWithInkProps = {
  /**
   * The URL of the REAL BYGGE report PDF (from Supabase or SharePoint).
   * This MUST return a valid PDF when fetched.
   */
  pdfUrl: string;

  /**
   * Optional: called after the PDF has been generated and downloaded.
   * You can use this later to e.g. move to a "Done" screen.
   */
  onFinished?: () => void;
};

/**
 * Helper to download a base64-encoded PDF as a file in the browser.
 */
function downloadBase64Pdf(base64: string, fileName: string) {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);

  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }

  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: "application/pdf" });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();

  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Finalization block:
 * - Shows the ink mark canvas
 * - Sends signature + pdfUrl to /api/apply-signature
 * - Downloads the updated PDF
 */
export default function FinalizeWithInk({
  pdfUrl,
  onFinished,
}: FinalizeWithInkProps) {
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  async function handleGeneratePdf() {
    if (!signatureDataUrl) {
      alert("Tegn en markering og klik 'Use this mark' først.");
      return;
    }

    if (!pdfUrl) {
      alert("Der mangler en PDF-URL (pdfUrl-prop er tom).");
      return;
    }

    setIsGenerating(true);

    try {
      const res = await fetch("/api/apply-signature", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          signaturePngDataUrl: signatureDataUrl,
          pdfUrl,
        }),
      });

      if (!res.ok) {
        console.error("API error:", res.status, await res.text());
        alert("Kunne ikke generere PDF med markering.");
        return;
      }

      const json = await res.json();

      if (!json.pdfBase64) {
        alert("API'et returnerede ikke pdfBase64.");
        return;
      }

      // You can change the filename if you want
      downloadBase64Pdf(json.pdfBase64, "bygge-rapport-med-markering.pdf");

      if (onFinished) onFinished();
    } catch (error) {
      console.error("Fejl ved /api/apply-signature:", error);
      alert("Der skete en fejl under genereringen af PDF.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div
      style={{
        marginTop: 24,
        padding: 16,
        borderRadius: 8,
        border: "1px solid #e5e7eb",
        background: "#f9fafb",
      }}
    >
      <h2 style={{ fontSize: 18, marginBottom: 8 }}>
        Endelig godkendelse med håndtegnet markering
      </h2>

      <p style={{ fontSize: 14, color: "#4b5563", marginBottom: 12 }}>
        Tegn en håndtegnet markering i feltet herunder for at bekræfte, at
        rapporten er gennemgået. Når du er færdig, klikker du &quot;Use this
        mark&quot; og derefter &quot;Generér endelig PDF&quot;.
      </p>

      {/* The canvas where user draws the mark */}
      <SignatureCanvas onChange={setSignatureDataUrl} />

      {signatureDataUrl && (
        <p
          style={{
            fontSize: 12,
            color: "#6b7280",
            marginTop: 8,
          }}
        >
          Markeringen er klar. Klik på knappen nedenfor for at generere den
          endelige PDF med markeringen indsat.
        </p>
      )}

      <button
        type="button"
        onClick={handleGeneratePdf}
        disabled={!signatureDataUrl || isGenerating}
        style={{
          marginTop: 16,
          padding: "10px 18px",
          borderRadius: 6,
          border: "none",
          cursor: !signatureDataUrl || isGenerating ? "not-allowed" : "pointer",
          backgroundColor:
            !signatureDataUrl || isGenerating ? "#9ca3af" : "#2563eb",
          color: "white",
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        {isGenerating ? "Genererer PDF..." : "Generér endelig PDF med markering"}
      </button>
    </div>
  );
}
