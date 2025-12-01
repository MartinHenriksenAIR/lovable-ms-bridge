export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";

/**
 * POST /api/apply-signature
 *
 * Expects JSON body:
 * {
 *   "signaturePngDataUrl": "data:image/png;base64,...."
 * }
 *
 * Returns:
 * {
 *   "pdfBase64": "<base64 encoded PDF>"
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const signaturePngDataUrl = body.signaturePngDataUrl as string | undefined;

    if (!signaturePngDataUrl || typeof signaturePngDataUrl !== "string") {
      return NextResponse.json(
        { error: "signaturePngDataUrl is required" },
        { status: 400 }
      );
    }

    // 1) Strip the "data:image/png;base64," prefix
    const commaIndex = signaturePngDataUrl.indexOf(",");
    if (commaIndex === -1) {
      return NextResponse.json(
        { error: "Invalid data URL format" },
        { status: 400 }
      );
    }
    const base64Signature = signaturePngDataUrl.slice(commaIndex + 1);

    // 2) Convert Base64 -> Uint8Array (PNG bytes)
    const signatureBytes = Uint8Array.from(
      Buffer.from(base64Signature, "base64")
    );

    // 3) Create a new PDF document (we'll embed the mark here)
    const pdfDoc = await PDFDocument.create();

    // A4 size in points: [width, height]
    const pageWidth = 595.28;
    const pageHeight = 841.89;

    const page = pdfDoc.addPage([pageWidth, pageHeight]);

    // 4) Embed the PNG image
    const pngImage = await pdfDoc.embedPng(signatureBytes);

    // Decide how big the signature should be on the PDF
    const desiredWidth = 200; // points
    const aspectRatio = pngImage.height / pngImage.width;
    const desiredHeight = desiredWidth * aspectRatio;

    // 5) Choose position (bottom-right)
    const margin = 50; // 50pt from edges
    const x = pageWidth - desiredWidth - margin;
    const y = margin;

    // 6) Draw the image on the page
    page.drawImage(pngImage, {
      x,
      y,
      width: desiredWidth,
      height: desiredHeight,
    });

    // 7) Save PDF to bytes
    const pdfBytes = await pdfDoc.save();

    // 8) Encode bytes as Base64 for JSON transport
    const pdfBase64 = Buffer.from(pdfBytes).toString("base64");

    return NextResponse.json({ pdfBase64 }, { status: 200 });
  } catch (err) {
    console.error("Error in /api/apply-signature:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
