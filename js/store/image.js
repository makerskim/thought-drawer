// 사진 크기 줄이기: 드라이브 용량과 글자 인식 속도를 위해 긴 변을 제한하고 JPEG으로 저장한다.

async function decode(blob) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch { /* 아래 방식으로 */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export async function downscale(blob, max = 2000, quality = 0.86) {
  if (blob.type === 'image/svg+xml' || blob.type === 'image/gif') return blob;
  const img = await decode(blob);
  const w = img.width;
  const h = img.height;
  const scale = Math.min(1, max / Math.max(w, h));
  if (scale === 1 && blob.type === 'image/jpeg') return blob;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  img.close?.();
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? blob), 'image/jpeg', quality));
}
