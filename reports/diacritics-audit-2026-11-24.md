# Kiểm toán dòng OCR mất dấu

Dữ liệu OCR được đọc lại từ checkpoint, không khởi động suy luận mới. Căn dòng chỉ phục vụ đo lường, không sửa OCR.

| Checkpoint | Trang | Mất toàn bộ dấu | Conf ≥ 0,85 | Thỏa Lô 5.4 | Thỏa nhưng vùng đề/hình | Thỏa mà lọt không hỏi | Mất dấu conf cao lọt không hỏi | Không-thỏa nhưng conf cao | Báo nhầm |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| read-eval-generated-handwriting-2026-11-19 | 46 | 32 | 4 | 21 | 5 | 0 | 4 | 4 | 0 |
| read-eval-generated-handwriting-2026-11-19-reader-revision | 46 | 7 | 4 | 2 | 1 | 0 | 3 | 3 | 0 |
| read-eval-generated-handwriting-2026-11-24-phase5 | 46 | 27 | 6 | 18 | 6 | 0 | 3 | 3 | 0 |

## read-eval-generated-handwriting-2026-11-19

Fingerprint báo cáo: `dfd09367f6c789939402bbc17b19e87b168aad51e9abf6ce78f16e3b955c4f86`; fingerprint checkpoint OCR: `8c54e7ba14c6a9e7b8ce342ce73151e40fd590b20ba5c7ec13986df1b9d23478`. Vocab thiếu graph/task: 9, 10.
Các dòng mất dấu nhưng không thỏa định nghĩa và vẫn conf cao: 4; lý do: one_or_two_familiar_words=4.
“Lọt không hỏi” chạy `parseWork` thật trên cả trang (vocab của bài): dòng vùng lời giải không nằm trong `unchecked` và không thuộc bước có conf < 0,85. Dòng vùng đề/hình không vào chấm nên không tính lọt.

## read-eval-generated-handwriting-2026-11-19-reader-revision

Fingerprint báo cáo: `ac25837e98a5ec5a3957f4dc126909a5f1cfca8f929005f0a0ab053c37dff676`; fingerprint checkpoint OCR: `171941c9e1babc836c6c9ce7b6502e072287751a711c6f5a7fc58d43ca0866ef`. Vocab thiếu graph/task: 9, 10.
Các dòng mất dấu nhưng không thỏa định nghĩa và vẫn conf cao: 3; lý do: one_or_two_familiar_words=3.
“Lọt không hỏi” chạy `parseWork` thật trên cả trang (vocab của bài): dòng vùng lời giải không nằm trong `unchecked` và không thuộc bước có conf < 0,85. Dòng vùng đề/hình không vào chấm nên không tính lọt.

## read-eval-generated-handwriting-2026-11-24-phase5

Fingerprint báo cáo: `196e5f35629054a30b821060fe285d9da45d87462372b0c57e265cc09a3c50ea`; fingerprint checkpoint OCR: `196e5f35629054a30b821060fe285d9da45d87462372b0c57e265cc09a3c50ea`. Vocab thiếu graph/task: 9, 10.
Các dòng mất dấu nhưng không thỏa định nghĩa và vẫn conf cao: 3; lý do: one_or_two_familiar_words=3.
“Lọt không hỏi” chạy `parseWork` thật trên cả trang (vocab của bài): dòng vùng lời giải không nằm trong `unchecked` và không thuộc bước có conf < 0,85. Dòng vùng đề/hình không vào chấm nên không tính lọt.

## Lệnh checkpoint Lượt B

Checkpoint `…-2026-11-24-phase5` là lượt thử prompt `lines` có thêm câu giữ dấu tiếng Việt (`by-page`). Prompt đó đã được hoàn lại vì CER cả trang xấu hơn `lines` cũ; lệnh dưới đây đo lại một checkpoint mới theo cùng cách:

```powershell
npm run build; npm run build:mvp --workspace @mathtwin/eval; node tools/eval/dist/mvp/tools/eval/src/mvp-handwriting-cli.js --images "C:\Users\arthur.anh\Documents\Codex\2026-11-18\b-n-l-gi-o-vi\outputs\handwriting-prompts\images\da-soat" --labels "C:\Users\arthur.anh\Documents\Codex\2026-11-18\b-n-l-gi-o-vi\outputs\handwriting-prompts\labels.json" --date 2026-11-24 --run phase5 --line-prompt by-page
node tools/eval/dist/diacritics-audit-cli.js --labels "C:\Users\arthur.anh\Documents\Codex\2026-11-18\b-n-l-gi-o-vi\outputs\handwriting-prompts\labels.json" --report reports/read-eval-generated-handwriting-2026-11-19.json --report reports/read-eval-generated-handwriting-2026-11-19-reader-revision.json --report reports/read-eval-generated-handwriting-2026-11-24-phase5.json --output reports/diacritics-audit-2026-11-24
```
