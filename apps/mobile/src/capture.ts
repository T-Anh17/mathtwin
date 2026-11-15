import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { vi } from './messages.vi.js';
import { mobile } from './native.js';

/** The system camera captures full still photos. Only a Base64 copy survives the native temporary file. */
export async function captureImage(): Promise<string> {
  try {
    const photo = await Camera.getPhoto({ source: CameraSource.Camera, resultType: CameraResultType.Base64,
      quality: 95, correctOrientation: true, saveToGallery: false });
    if (!photo.base64String || photo.format !== 'jpeg') throw { code: 'image_invalid' };
    return `data:image/jpeg;base64,${photo.base64String}`;
  } finally { await mobile.cleanupCameraTempFiles(); }
}

/** Secondary option only: video-frame resolution can be lower than the system still camera. */
export async function captureWebViewImage(): Promise<string> {
  const permission = await Camera.requestPermissions({ permissions: ['camera'] });
  if (permission.camera !== 'granted') throw { code: 'image_invalid' };
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 2560 } }, audio: false });
  const dialog = document.createElement('dialog');
  const video = document.createElement('video'); video.autoplay = true; video.playsInline = true; video.srcObject = stream;
  const shoot = document.createElement('button'); shoot.textContent = vi.camera;
  const cancel = document.createElement('button'); cancel.textContent = vi.cancel;
  dialog.append(video, shoot, cancel); document.body.append(dialog); dialog.showModal();
  try {
    await video.play();
    return await new Promise<string>((resolve, reject) => {
      shoot.onclick = () => {
        const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx || !canvas.width || !canvas.height) { reject({ code: 'image_invalid' }); return; }
        ctx.drawImage(video, 0, 0); const result = canvas.toDataURL('image/jpeg', 0.95);
        canvas.width = 0; canvas.height = 0; resolve(result);
      };
      cancel.onclick = () => reject({ code: 'aborted' });
      dialog.oncancel = () => reject({ code: 'aborted' });
    });
  } finally { stream.getTracks().forEach((track) => track.stop()); video.srcObject = null; dialog.remove(); }
}

export function fileDataUrl(file: File): Promise<string> {
  if (file.size > 10 * 1024 * 1024 || !['image/png', 'image/jpeg'].includes(file.type)) return Promise.reject({ code: 'image_invalid' });
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject({ code: 'image_invalid' });
    reader.onerror = () => reject({ code: 'image_invalid' }); reader.readAsDataURL(file);
  });
}
