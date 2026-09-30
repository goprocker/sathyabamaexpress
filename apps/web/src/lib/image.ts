// Getting photos and PDFs ready to upload. The API caps a request at a few MB,
// so photos from a phone camera are shrunk in the browser first.

/** Downscale a photo to a JPEG data URL, small enough to send but still legible (bills, receipts). */
export function resizeImage(file: File, maxSide = 1280): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Canvas unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unreadable image"));
    };
    img.src = url;
  });
}

export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

/** A file ready to attach, plus a small preview when it is a photo. */
export interface PreparedFile {
  file: File;
  previewUrl?: string;
}

const dataUrlToFile = async (dataUrl: string, name: string): Promise<File> => {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], name, { type: blob.type });
};

/**
 * Photos are resized to JPEG; PDFs pass through when they fit. Anything else,
 * or anything too big, throws a message that is safe to show as is.
 */
export async function prepareUpload(file: File): Promise<PreparedFile> {
  if (file.type === "application/pdf") {
    if (file.size > MAX_UPLOAD_BYTES) throw new Error("That PDF is over 3 MB. Try a smaller file, or take a photo of it instead.");
    return { file };
  }
  if (!file.type.startsWith("image/")) throw new Error("Choose a photo (JPG or PNG) or a PDF.");
  let dataUrl: string;
  try {
    dataUrl = await resizeImage(file, 1600);
  } catch {
    throw new Error("Couldn't read that photo. Try another one.");
  }
  const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
  const resized = await dataUrlToFile(dataUrl, `${baseName}.jpg`);
  if (resized.size > MAX_UPLOAD_BYTES) throw new Error("That photo is too large even after shrinking. Try a smaller one.");
  return { file: resized, previewUrl: dataUrl };
}
