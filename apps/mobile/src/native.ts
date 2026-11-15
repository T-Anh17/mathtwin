import { CapacitorHttp, registerPlugin } from '@capacitor/core';
import type { HttpTransport, MobilePlugin } from './contracts.js';

export const mobile = registerPlugin<MobilePlugin>('MathTwin');
export const transport: HttpTransport = {
  post: async (options) => {
    const result = await CapacitorHttp.post({ ...options, responseType: 'json' });
    return { status: result.status, data: result.data as unknown };
  },
};
