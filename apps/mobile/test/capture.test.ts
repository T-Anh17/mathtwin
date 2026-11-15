import { beforeEach, describe, expect, it, vi } from 'vitest';

const camera = vi.hoisted(() => ({ getPhoto: vi.fn(), cleanup: vi.fn() }));
vi.mock('@capacitor/camera', () => ({ Camera: { getPhoto: camera.getPhoto }, CameraSource: { Camera: 'CAMERA' }, CameraResultType: { Base64: 'base64' } }));
vi.mock('../src/native.js', () => ({ mobile: { cleanupCameraTempFiles: camera.cleanup } }));
import { captureImage } from '../src/capture.js';

describe('system camera capture', () => {
  beforeEach(() => { vi.resetAllMocks(); camera.cleanup.mockResolvedValue(undefined); });
  it('uses full still capture without resize, reads Base64 and cleans native temporary files', async () => {
    camera.getPhoto.mockResolvedValue({ format: 'jpeg', base64String: 'AQID' });
    expect(await captureImage()).toBe('data:image/jpeg;base64,AQID');
    expect(camera.getPhoto).toHaveBeenCalledExactlyOnceWith({ source: 'CAMERA', resultType: 'base64', quality: 95, correctOrientation: true, saveToGallery: false });
    expect(camera.cleanup).toHaveBeenCalledOnce();
    expect(camera.cleanup.mock.invocationCallOrder[0]).toBeGreaterThan(camera.getPhoto.mock.invocationCallOrder[0]!);
  });
  it('cleans the empty temporary JPEG when the camera is cancelled or fails', async () => {
    camera.getPhoto.mockRejectedValue({ code: 'aborted' });
    await expect(captureImage()).rejects.toMatchObject({ code: 'aborted' }); expect(camera.cleanup).toHaveBeenCalledOnce();
  });
  it('rejects missing Base64 and still cleans files', async () => {
    camera.getPhoto.mockResolvedValue({ format: 'jpeg' });
    await expect(captureImage()).rejects.toMatchObject({ code: 'image_invalid' }); expect(camera.cleanup).toHaveBeenCalledOnce();
  });
  it('surfaces a cleanup failure instead of claiming the photo was removed', async () => {
    camera.getPhoto.mockResolvedValue({ format: 'jpeg', base64String: 'AQID' }); camera.cleanup.mockRejectedValue({ code: 'native_error' });
    await expect(captureImage()).rejects.toMatchObject({ code: 'native_error' });
  });
});
