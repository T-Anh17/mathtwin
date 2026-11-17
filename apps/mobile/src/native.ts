import { registerPlugin } from '@capacitor/core';
import type { HttpTransport, MobilePlugin } from './contracts.js';

export const mobile = registerPlugin<MobilePlugin>('MathTwin');
export const transport: HttpTransport = {
  post: (options) => mobile.post(options),
};
