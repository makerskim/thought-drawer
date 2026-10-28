// 사진 크기 줄이기 (js/store/image.js와 같은 규칙). 확장 프로그램의 백그라운드에는 화면(DOM)이 없어서 OffscreenCanvas를 쓴다.

export async function downscale(blob, max = 2000, quality = 0.86) {
  if (blob.type === 'image/svg+xml' || blob.type === 'image/gif') return blob;
  const img = await createImageBitmap(blob);
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  if (scale === 1 && blob.type === 'image/jpeg') { img.close(); return blob; }
  const canvas = new OffscreenCanvas(Math.round(img.width * scale), Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  img.close();
  return canvas.convertToBlob({ type: 'image/jpeg', quality });
}
