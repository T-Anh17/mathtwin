# Đo lại bộ đọc ảnh sau Lô 4.7 — 2026-11-19

Code thử schema đã gỡ ngày 2026-11-20 theo quyết định người dùng.

Đã đo OCR đủ 46 trang tổng hợp. Lượt thử đề dừng ở 12/40 trang do mất văn bản yêu cầu. Chưa có ảnh thật đã gán nhãn để nghiệm thu.

## Đọc đề trên synthetic-hw

So B một lượt trước xác nhận với mốc B của Lô 4.7. Hai lượt dùng Qwen3-VL-2B Q4_K_M trên CPU, 4 luồng và cạnh ảnh tối đa 768 px. Nhánh thử nghiệm giới hạn loại yêu cầu trong schema và làm rõ cách ghi nhãn đỉnh, trọng số, tên cạnh. App tiếp tục dùng prompt đồ thị của Lô 4.7 vì lượt thử làm mất văn bản yêu cầu trên các trang đối chiếu đầu tiên.

| Chỉ số | Lô 4.7 | Schema thử nghiệm |
| --- | ---: | ---: |
| Có văn bản và bản nháp yêu cầu | 11/12 | 0/12 |
| Yêu cầu + dạng câu đúng khi đối chiếu trên đồ thị chuẩn | 0/12 | 0/12 |
| Đồ thị đúng | 0/12 | 0/12 |
| Có ProblemSpec hợp lệ | 0/12 | 0/12 |
| Đọc đúng toàn đề | 0/12 | 0/12 |
| Sai nhưng đủ cờ theo quy ước Lô 4.7 | 11/12 | 10/12 |

Mỗi loại lỗi bên dưới đếm số trang có khác biệt thuộc loại đó. Một trang có thể xuất hiện ở nhiều dòng. Khi cả đồ thị vắng, bộ đối chiếu ghi lỗi `graph` cấp trang.

| Loại lỗi | Lô 4.7 | Schema thử nghiệm |
| --- | ---: | ---: |
| `vertex_label` | 7 | 6 |
| `extra_edge` | 3 | 4 |
| `missing_edge` | 5 | 5 |
| `weight` | 6 | 5 |
| `edge_name` | 8 | 5 |
| `graph` | 1 | 2 |

Lượt thử ghi nhận 2 lỗi adapter trên 12 trang. Trung vị lượt thử 77.7 giây/trang trên máy tính. Phép đối chiếu cô lập yêu cầu chỉ dùng đồ thị chuẩn sau suy luận. D tiếp tục là nháp sửa tay.

## OCR và vùng bài làm trên bộ 46 ảnh mô phỏng

| Chỉ số | Prompt gốc | Thử prompt nối tiếp trên mọi trang | Cấu hình áp dụng theo số trang |
| --- | ---: | ---: | ---: |
| Trang đọc thành công | 46/46 | 46/46 | 46/46 |
| CER | 10.54% | 12.13% | 10.53% |
| WER | 28.14% | 23.33% | 28.08% |
| Trung vị lượt đọc thành công | 82.3 s | 75.3 s | 82.3 s |

Cột áp dụng theo số trang ghép dữ liệu đã đo từ hai lượt. Trang đầu dùng prompt và kết quả gốc. Trang nối tiếp dùng prompt và kết quả mới. Tính CER/WER theo tổng số lỗi và tổng mẫu số. Cột ghép là phép đối chiếu cấu hình gửi cùng yêu cầu cho cùng ảnh, chưa có lượt suy luận mới chạy liên tục với cả hai prompt.

Riêng 6 trang nối tiếp đã đo, CER 6.32% → 6.29%, WER 21.90% → 21.50%. Thử prompt mới ở trang đầu làm CER tăng mạnh ở Bài 28 và Bài 30, nên áp dụng prompt mới từ trang thứ hai.

Đếm lại từ checkpoint OCR bằng căn dòng đơn điệu sau khi bỏ dấu: prompt gốc có 32/319 dòng mất toàn bộ dấu tiếng Việt trên 10/46 trang, trong đó 4 dòng có conf ≥0,85; lượt `reader-revision` (prompt nối tiếp trên mọi trang) còn 7/316 dòng trên 5/46 trang, trong đó 4 dòng conf ≥0,85. Đây là tín hiệu giảm số dòng mất dấu, nhưng vẫn còn rủi ro đọc sai có conf cao; chưa đủ bằng chứng đổi prompt ở trang 1 vì bộ ảnh chưa xác minh và không phải ảnh chụp thật. Chỉ ghi nhận và đề xuất đo lại trên ảnh thật, không đổi cấu hình app trong lô này.

Chạy lại bước lọc vùng trên OCR lưu của sáu trang nối tiếp. Số trang cần khoanh là 5/6 → 3/6. Chỉ số này đo quyết định hỏi khoanh tại đầu vào của luồng bài làm.

Bài 26 trang 2 có 11/15 dòng nội dung mang nhãn đề ở mốc cũ và 0/15 sau sửa. Khung hợp lệ 6/16 → 5/16. Luồng yêu cầu khoanh vùng và để trống khung gợi ý khi trang nối tiếp có dòng lời giải thiếu khung. Trang có tiêu đề “tiếp Bài …” vẫn được xử lý theo các kiểm tra vùng thông thường.

Các nhãn văn bản ở bộ ảnh OCR có 0/46 trang được xác minh. CER/WER đo độ khớp với văn bản tham chiếu. Đây là phép đo khâu đọc trên Node, ngoài phép đo chấm và ngoài số đo độ trễ Android.

## Tệp bàn giao và xác minh

- Bộ đọc chung giữ lại: `packages/reader/src/{index,schema,types}.ts`, `packages/reader-llamacpp/src/index.ts`, `packages/reader-llamacpp-shared/src/request.ts` (continuation-lines; không còn schema thử nghiệm).
- Luồng Android: `apps/mobile/src/{benchmark,problem-readers}.ts`, `apps/mobile/src/flow/work-reading.ts`, `packages/work/src/{read,regions}.ts`.
- Bộ đo giữ lại: `tools/eval/src/mvp-handwriting-cli.ts`, `tools/eval/{README.md,package.json}`, `package-lock.json`.
- Kiểm thử: `apps/mobile/test/work-flow.test.ts`, `packages/reader-llamacpp-shared/test/shared.test.ts`, `packages/work/test/{layout,strikes}.test.ts`, `packages/work/test/fixtures/bai-26-page-2-ocr.json`.
- Báo cáo: tệp này, JSON phép thử đề và cặp Markdown/JSON OCR chạy lại.

`npm test` lượt cuối đạt 2.248 pass, 0 fail trên 84 tệp. `npm run build`, `npm run build:mvp --workspace @mathtwin/eval` và build APK debug với JDK 21 đều thành công.

[Báo cáo gốc Lô 4.7](mvp-eval-2026-11-18.md) · [Báo cáo OCR gốc](read-eval-generated-handwriting-2026-11-19.md) · [JSON đề](reader-improvement-problem-2026-11-19.json) · [Báo cáo OCR chạy lại](read-eval-generated-handwriting-2026-11-19-reader-revision.md)
