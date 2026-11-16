import { describe, expect, it } from 'vitest';
import { errorCode, messageFor, vi } from '../src/messages.vi.js';

describe('dataset import error messages on the benchmark screen', () => {
  it.each([
    ['internal', 'Bộ nhớ trong (internal)'],
    ['external', 'Bộ nhớ ngoài (external)'],
  ] as const)('shows the selected %s dataset location, name and entry count', (location, label) => {
    expect(vi.datasetSummary('synthetic-hw', 40, location)).toBe(`synthetic-hw: 40 · ${label}`);
  });
  it.each([
    ['ids_missing', 'Không tìm thấy file ids.json.'],
    ['ids_too_large', 'File ids.json vượt quá 1 MB.'],
    ['ids_parse', 'Không đọc hoặc phân tích được ids.json.'],
    ['entry_count', 'Bộ đo phải có từ 1 đến 1000 mục.'],
    ['entry_name', 'Tên bộ đo, id hoặc tên file ảnh không hợp lệ.'],
    ['duplicate_id', 'Id ảnh bị trùng.'],
    ['image_missing', 'Không tìm thấy file ảnh.'],
    ['image_too_large', 'File ảnh vượt quá 10 MB.'],
  ])('shows native reject data.reason %s and Vietnamese explanation', (reason, explanation) => {
    const error = { code: 'dataset_invalid', message: 'dataset_invalid', data: { reason } };
    expect(errorCode(error)).toBe('dataset_invalid');
    expect(messageFor(error)).toBe(`${vi.errors.dataset_invalid} ${explanation} (${reason})`);
  });

  it('includes the affected id and file for an image error', () => {
    expect(messageFor({ code: 'dataset_invalid', data: { reason: 'image_missing', id: 'x1', file: 'sample-001.png', operation: 'stat' } }))
      .toBe(`${vi.errors.dataset_invalid} Không tìm thấy file ảnh. (image_missing; id: x1; file: sample-001.png; bước: stat)`);
  });

  it.each(['read', 'parse'])('distinguishes ids.json failure at the %s step', (operation) => {
    expect(messageFor({ code: 'dataset_invalid', data: { reason: 'ids_parse', file: 'ids.json', operation } }))
      .toContain(`(ids_parse; file: ids.json; bước: ${operation})`);
  });

  it.each([undefined, null, 'ids_missing', {}, { reason: null }, { reason: 'future_reason' }, { reason: 'toString' }])
    ('keeps the original message for missing or unsupported diagnostics: %j', (data) => {
      expect(messageFor({ code: 'dataset_invalid', data })).toBe(vi.errors.dataset_invalid);
    });

  it('ignores malformed optional fields', () => {
    expect(messageFor({ code: 'dataset_invalid', data: { reason: 'entry_name', id: 1, file: {}, operation: null } }))
      .toBe(`${vi.errors.dataset_invalid} Tên bộ đo, id hoặc tên file ảnh không hợp lệ. (entry_name)`);
  });

  it('preserves messages for other errors and existing reason/AbortError handling', () => {
    expect(messageFor({ code: 'checksum', data: { reason: 'ids_missing' } })).toBe(vi.errors.checksum);
    expect(messageFor({ reason: 'timeout' })).toBe(vi.errors.timeout);
    expect(messageFor({ name: 'AbortError' })).toBe(vi.errors.aborted);
    expect(messageFor(new Error('unrecognized'))).toBe(vi.errors.read_failed);
    expect(messageFor(null)).toBe(vi.errors.read_failed);
  });
});
