/**
 * 原生相機／相簿選圖。
 * 僅在 Capacitor 原生 App 使用；瀏覽器版一律回 null，呼叫端須沿用原本的 <input type="file">。
 */

import { isNativeApp } from "@/lib/appMode";

export interface NativePickOptions {
  /** 是否允許在系統介面內裁切（頭貼用 true） */
  allowEditing?: boolean;
  /** 輸出品質 1-100 */
  quality?: number;
  /** 產生的檔名前綴 */
  fileNamePrefix?: string;
}

/** 是否可使用原生相機（決定 UI 要用 Camera 還是 file input） */
export function canUseNativeCamera(): boolean {
  return isNativeApp();
}

function dataUrlToFile(dataUrl: string, fileName: string): File {
  const [header, body] = dataUrl.split(",");
  const mime = /data:([^;]+);/.exec(header)?.[1] || "image/jpeg";
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], fileName, { type: mime });
}

/**
 * 讓使用者選擇「拍照」或「從相簿選取」，回傳可直接上傳的 File。
 * 使用者取消時回傳 null；非原生環境也回傳 null。
 */
export async function pickImageNative(options: NativePickOptions = {}): Promise<File | null> {
  if (!isNativeApp()) return null;
  try {
    const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
    const photo = await Camera.getPhoto({
      quality: options.quality ?? 85,
      allowEditing: options.allowEditing ?? false,
      resultType: CameraResultType.Uri,
      source: CameraSource.Prompt,
      promptLabelHeader: "選擇照片",
      promptLabelPhoto: "從相簿選取",
      promptLabelPicture: "拍照",
      promptLabelCancel: "取消",
      correctOrientation: true,
    });

    const prefix = options.fileNamePrefix || "photo";
    const format = (photo?.format || "jpeg").toLowerCase();
    const ext = format === "png" ? "png" : format === "webp" ? "webp" : "jpg";
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    const fileName = `${prefix}-${Date.now()}.${ext}`;

    // 優先用 webPath（原生檔案 URL）取得 Blob，記憶體較省也較穩定
    if (photo?.webPath) {
      try {
        const res = await fetch(photo.webPath);
        const blob = await res.blob();
        // WKWebView 偶爾回傳 size=0 的空 Blob，需退回 Base64 重取
        if (blob.size > 0) {
          const type = blob.type && blob.type.startsWith("image/") ? blob.type : mime;
          return new File([blob], fileName, { type });
        }
      } catch {
        // 忽略，改走 Base64 後援
      }
    }
    if (photo?.dataUrl) {
      const f = dataUrlToFile(photo.dataUrl, fileName);
      if (f.size > 0) return f;
    }

    // 後援：直接以 Base64 重新取一張，確保拿得到實際影像內容
    const base64Photo = await Camera.getPhoto({
      quality: options.quality ?? 85,
      allowEditing: options.allowEditing ?? false,
      resultType: CameraResultType.Base64,
      source: CameraSource.Prompt,
      promptLabelHeader: "選擇照片",
      promptLabelPhoto: "從相簿選取",
      promptLabelPicture: "拍照",
      promptLabelCancel: "取消",
      correctOrientation: true,
    });
    if (base64Photo?.base64String) {
      return dataUrlToFile(`data:${mime};base64,${base64Photo.base64String}`, fileName);
    }
    return null;
  } catch (e: any) {
    // 使用者取消不視為錯誤
    const msg = String(e?.message || e || "").toLowerCase();
    if (msg.includes("cancel") || msg.includes("cancelled")) return null;
    throw e;
  }
}

