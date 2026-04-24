import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import mammoth from "mammoth";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

export interface ParsedInput {
  kind: "pdf" | "image" | "text" | "docx";
  text: string;
  images: string[]; // base64 data URLs (for images or scanned PDFs)
  sourceName?: string;
}

const IMAGE_MIME = /^image\/(png|jpeg|jpg|webp|gif)$/i;

export async function parseFile(file: File): Promise<ParsedInput> {
  const name = file.name;
  const type = file.type.toLowerCase();

  if (type === "application/pdf" || name.toLowerCase().endsWith(".pdf")) {
    return parsePdf(file);
  }
  if (IMAGE_MIME.test(type)) {
    return parseImage(file);
  }
  if (
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.toLowerCase().endsWith(".docx")
  ) {
    return parseDocx(file);
  }
  if (type.startsWith("text/") || /\.(txt|md)$/i.test(name)) {
    const text = await file.text();
    return { kind: "text", text, images: [], sourceName: name };
  }
  throw new Error(`Unsupported file type: ${type || name}`);
}

export function parseText(text: string): ParsedInput {
  return { kind: "text", text, images: [] };
}

async function parsePdf(file: File): Promise<ParsedInput> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((it) => ("str" in it ? it.str : ""))
      .join(" ");
    parts.push(pageText);
  }
  const text = parts.join("\n\n").trim();

  // If the PDF has basically no extractable text, render first few pages as images.
  if (text.replace(/\s/g, "").length < 40) {
    const images = await renderPdfPages(pdf, Math.min(pdf.numPages, 4));
    return { kind: "image", text: "", images, sourceName: file.name };
  }

  return { kind: "pdf", text, images: [], sourceName: file.name };
}

async function renderPdfPages(
  pdf: pdfjs.PDFDocumentProxy,
  count: number
): Promise<string[]> {
  const out: string[] = [];
  for (let i = 1; i <= count; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport }).promise;
    out.push(canvas.toDataURL("image/png"));
  }
  return out;
}

async function parseImage(file: File): Promise<ParsedInput> {
  const dataUrl = await fileToDataUrl(file);
  return { kind: "image", text: "", images: [dataUrl], sourceName: file.name };
}

async function parseDocx(file: File): Promise<ParsedInput> {
  const buffer = await file.arrayBuffer();
  const { value } = await mammoth.extractRawText({ arrayBuffer: buffer });
  return { kind: "docx", text: value, images: [], sourceName: file.name };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
