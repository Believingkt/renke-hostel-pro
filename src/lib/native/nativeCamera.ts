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
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Prompt,
      promptLabelHeader: "選擇照片",
      promptLabelPhoto: "從相簿選取",
      promptLabelPicture: "拍照",
      promptLabelCancel: "取消",
      correctOrientation: true,
    });
    if (!photo?.dataUrl) return null;
    const ext = (photo.format || "jpeg").toLowerCase() === "png" ? "png" : "jpg";
    const prefix = options.fileNamePrefix || "photo";
    return dataUrlToFile(photo.dataUrl, `${prefix}-${Date.now()}.${ext}`);
  } catch (e: any) {
    // 使用者取消不視為錯誤
    const msg = String(e?.message || e || "").toLowerCase();
    if (msg.includes("cancel") || msg.includes("cancelled")) return null;
    throw e;
  }
}
