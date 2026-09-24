/**
 * Logo 正規化：自動裁掉透明留白（trim）→ 等比縮放不裁切 → 補透明邊（letterbox）→ 輸出 WebP。
 * 讓不同比例的夥伴 logo 並排時視覺大小一致。
 */

export const LOGO_MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2MB
export const LOGO_ACCEPTED_TYPES = ["image/png", "image/webp", "image/svg+xml"];

const TARGET_H = 160; // 輸出高度（2x of 80px 顯示高度）
const TARGET_W = 480; // 輸出畫布寬度上限

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

/** 找出非透明像素的邊界 */
function getTrimBounds(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const { data } = ctx.getImageData(0, 0, w, h);
  let top = h, left = w, right = 0, bottom = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const alpha = data[(y * w + x) * 4 + 3];
      if (alpha > 8) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (right < left || bottom < top) return { x: 0, y: 0, w, h };
  return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

export interface NormalizedLogo {
  blob: Blob;
  width: number;
  height: number;
}

export async function normalizeLogo(file: File): Promise<NormalizedLogo> {
  const img = await loadImage(file);

  // 1. 畫到暫存畫布並 trim 掉透明留白
  const src = document.createElement("canvas");
  src.width = img.naturalWidth;
  src.height = img.naturalHeight;
  const sctx = src.getContext("2d", { willReadFrequently: true })!;
  sctx.drawImage(img, 0, 0);

  let bounds = { x: 0, y: 0, w: src.width, h: src.height };
  try {
    bounds = getTrimBounds(sctx, src.width, src.height);
  } catch {
    // 跨來源或不可讀時略過 trim
  }

  // 2. 等比縮放（不裁切）到目標高度，寬度超過上限時再依寬度縮
  let scale = TARGET_H / bounds.h;
  if (bounds.w * scale > TARGET_W) scale = TARGET_W / bounds.w;
  const drawW = Math.max(1, Math.round(bounds.w * scale));
  const drawH = Math.max(1, Math.round(bounds.h * scale));

  // 3. 補透明邊：固定高度畫布，寬度貼合內容（左右各留 4px 呼吸空間）
  const out = document.createElement("canvas");
  out.width = drawW + 8;
  out.height = TARGET_H;
  const octx = out.getContext("2d")!;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(
    src,
    bounds.x, bounds.y, bounds.w, bounds.h,
    4, Math.round((TARGET_H - drawH) / 2), drawW, drawH
  );

  const blob = await new Promise<Blob | null>((resolve) =>
    out.toBlob(resolve, "image/webp", 0.92)
  );
  if (!blob) throw new Error("圖片轉檔失敗");
  return { blob, width: out.width, height: out.height };
}
