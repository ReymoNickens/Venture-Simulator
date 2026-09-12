import { DEFAULT_MAX_PHOTO_BYTES, DEFAULT_MAX_PHOTO_EDGE, JPEG_QUALITY, ALLOWED_PHOTO_TYPES } from "@/lib/domain/config";

export async function compressPhoto(
  file: File,
  maxBytes = DEFAULT_MAX_PHOTO_BYTES,
): Promise<{ dataUrl: string; mime: string }> {
  if (!ALLOWED_PHOTO_TYPES.includes(file.type as (typeof ALLOWED_PHOTO_TYPES)[number])) {
    throw new Error("Use a JPEG, PNG, or WebP photo.");
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, DEFAULT_MAX_PHOTO_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not compress this photo.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let quality = JPEG_QUALITY;
  let blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  while (blob && blob.size > maxBytes && quality > 0.4) {
    quality -= 0.1;
    blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  }
  if (!blob || blob.size > maxBytes) {
    throw new Error("The photo is still too large after compression. Try a closer, smaller shot.");
  }
  const dataUrl = await blobToDataUrl(blob);
  return { dataUrl, mime: "image/jpeg" };
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
