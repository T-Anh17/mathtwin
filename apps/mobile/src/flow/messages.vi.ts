import type { Task } from '@mathtwin/core';
import type { Stage } from './types.js';

export const sessionVi = {
  untitled: 'Đề mới', saved: 'Phiên đã lưu trên thiết bị.', remove: 'Xóa phiên',
  storageError: 'Không lưu hoặc mở được phiên. Vui lòng thử lại.', retry: 'Thử lại',
  review: 'Kiểm tra các dòng máy đọc trước khi xác nhận bài đúng.',
  retakeProblem: 'Làm lại đề', retakeWork: 'Làm lại bài làm',
  photos: (count: number) => `${count} ảnh đã lưu`,
  readerBytes: (bytes: number) => `B · ${(bytes / 1_000_000_000).toFixed(1)} GB`,
  stages: {
    problem_capture: 'Chờ nhập đề', problem_reading: 'Đang đọc đề', problem_confirm: 'Chờ xác nhận đề',
    solution: 'Đã có lời giải', work_capture: 'Chờ nhập bài làm', work_reading: 'Đang đọc bài làm',
    work_review: 'Chờ soát bài làm', result: 'Đã chấm',
  } satisfies Record<Stage, string>,
  tasks: {
    elements: 'Đỉnh và cạnh', degree: 'Bậc của đỉnh', degree_sequence: 'Dãy bậc', path: 'Đường đi',
    connectivity: 'Liên thông', euler: 'Euler', hamilton: 'Hamilton', shortest_path: 'Đường đi ngắn nhất',
    tsp: 'Người du lịch', postman: 'Người đưa thư', statements: 'Kiểm tra phát biểu',
  } satisfies Record<Task['type'], string>,
  verdicts: { DUNG: 'ĐÚNG', SAI: 'SAI', CAN_XAC_NHAN: 'CẦN XÁC NHẬN', KHONG_DU_CAN_CU: 'KHÔNG ĐỦ CĂN CỨ' },
};
