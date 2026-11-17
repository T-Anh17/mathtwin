# Lô 3.1 — dữ liệu bài làm và bộ đo

Hoàn tất đúng Lô 3.1: 5 claim core, khung work (kiểu, vocabularyOf, compareWork), truth viết tay, bộ chữ, CLI oracle và hướng dẫn gán nhãn. Không triển khai parser. Không gọi adb, không đo điện thoại, không tải model; không thêm dependency bên ngoài.

## Kiểm tra

- `npm test`: **1.279 passed, 0 failed; 56 test files passed**.
- `npx tsc --noEmit -p <gói>/tsconfig.json`: core, reader, work, tools/eval đều exit 0.
- 60 bài testdata/core giữ nguyên file và kết quả (cả ca chấm và ca chỉ giải), kiểm bởi core-corpus.test.ts.
- Validator synthetic-hw: 40 nhãn hợp lệ; real: 0 đề, chưa có ảnh thật.
- Oracle dev: 720/720 exact; 1.284/1.284 claim và nguồn dòng; 684/684 kết luận so được, 36 hỏi lại; 324/324 lỗi đầu đúng.
- Oracle test: 480/480 exact; 856/856 claim và nguồn dòng; 456/456 kết luận so được, 24 hỏi lại; 216/216 lỗi đầu đúng.
- Oracle synthetic-hw: 40/40 exact; 128/128 claim và nguồn dòng; 40/40 kết luận; 20/20 lỗi đầu; 20 DUNG, 20 SAI.
- Cả ba báo cáo: 0 `silentFalseCorrect`, 0 `silentFalseWrongParse`, 0 `silentFalseWrongReading`, 0 `proseAsUnchecked`, 0 bước từ dòng gạch. Đây là kiểm bộ đo bằng truth, **không phải độ chính xác parser/OCR**. Chưa đo sau hỏi lại; chưa đủ căn cứ trên ảnh thật.

Báo cáo chi tiết `.md` + `.json`:

- `work-eval-work-text-truth-dev-2026-11-17`
- `work-eval-work-text-truth-test-2026-11-17`
- `work-eval-synthetic-hw-truth-2026-11-17`

## Quyết định & giả định

1. Bám đúng mã lỗi đã yêu cầu: thiếu danh sách BO_SOT; thừa/đỉnh lạ SAI_PHEP_TINH; cạnh thừa/không tồn tại CANH_KHONG_TON_TAI; sai số đếm SAI_PHEP_TINH. Vertex_list không chấp nhận trùng đỉnh; edge_list là multiset vô hướng, giữ khuyên và số lần cạnh song song. Không thêm vào StatementCheck.
2. Truth viết tay sinh cùng bộ sinh chữ. Dijkstra lấy bước chọn và nhãn số của đỉnh chưa khoanh từ từng hàng; không sinh claim từ header, ô vô cực, dòng gạch hoặc câu văn không định lượng. Các đường lặp người đưa thư nhóm theo đường của từng cặp được liệt kê, tổng dùng final_answer. Vòng sửa review đã sinh lại cả 40 trang: bốn ảnh cùng layout/lines thay đổi do sửa hai câu mô tả; source.svg và các trang còn lại giữ nội dung. Cập nhật work.json/prose và hash metadata đồng bộ.
3. Work-text gồm 60 × 5 × 4 = 1.200 mẫu, chia theo họ (3 dev, 2 test trong file riêng), nhánh dựng bảng Dijkstra chỉ nhận claims đầy đủ. Cả 10 fixture có bước chọn trong core đều có claims thưa: 40 mẫu dev-table dùng dev-direct và 40 mẫu test-notes dùng test-student, ghi tableFallback: true. Không lấy câu dev làm fallback cho test; nhánh bảng được kiểm bằng ca đầy đủ trong test. ClaimBody, step, conf, box và nhãn chấm gốc được giữ; raw thay bằng câu sạch theo họ để khớp dòng nguồn. Nhiễu thay chữ lines, không thay truth.
4. Có **11 ca chỉ giải** (04, 05, 52–60), không phải chỉ sáu bài cuối: claims rỗng, expected chỉ có solutionAnswer. Đánh dấu solveOnly và lấy KHONG_DU_CAN_CU từ grade mảng rỗng. Cộng ca 51, có 12/60 bài không có bước: 240/1.200 mẫu chữ, được báo riêng, không bịa claim.
5. Bảng nhầm thực đo từ B (36 trang có chữ; 4 lượt thất bại ghi riêng) và C (40 trang). Báo cáo C tổng hợp không có chữ; dùng debug cùng lượt đo, ghi SHA-256 hai debug và báo cáo C. Căn toàn trang bằng Levenshtein code point NFC, gồm cả đề/hình/bảng/bài làm; bảng phản ánh cả lỗi bỏ dòng/phát hiện, không phải căn dòng thủ công. Bộ sinh seed và công thức ghi trong testdata/work-text/README.md; conf dòng tổng hợp không phải confidence đã hiệu chuẩn của OCR.
6. Thêm WorkTruth.lines tùy chọn để đo đọc nhầm/dòng gạch; WorkTruth.prose bắt buộc khi kiểm dữ liệu sinh synthetic-hw/work-text, tùy chọn cho real; expected chấp nhận null cho trường vắng. Export claimKey để dùng cùng chuẩn hóa khi kiểm dữ liệu. Không có chữ nguồn đủ để so thì readingMismatch có thể null; nếu kết luận SAI sai thì xếp bảo thủ vào loại hiểu sai (ii). LCS giữ thứ tự claim, bỏ metadata; danh sách đỉnh và cạnh chuẩn hóa không xét thứ tự, đường đi vẫn xét thứ tự. Accuracy dòng tính trên cặp claim đã ghép. Hai phía rỗng quy ước điểm 1; có claim ở chỉ một phía quy ước precision/recall 0.
7. CLI Lô 3.1 luôn dùng parser oracle. Nguồn device nạp chữ từ file; engine có oracle sẵn và registry TextReader cho code gọi, không tự khởi chạy model trong CLI. Work-text chỉ có nguồn truth. Báo cáo ghi rõ chữ quan sát không được dùng tạo claim. Vòng trả lời hỏi lại thuộc Lô 3.4.
8. Dữ liệu đề thật cũ không có work.json vẫn kiểm được; nếu có thì kiểm raw, bước, nguồn dòng và kết quả grade. Synthetic-hw bắt buộc work.json. Định dạng dòng cũ một trang chuyển box pixel theo kích thước ảnh; dòng có index/page giữ hệ 0–1000. Không ghi log chữ bài làm.

## File tạo/sửa

File mới chức năng và test:

- `packages/core/test/grade-work-claims.test.ts`
- `packages/work/README.md`
- `packages/work/package.json`
- `packages/work/src/compare.ts`
- `packages/work/src/index.ts`
- `packages/work/src/types.ts`
- `packages/work/src/vocabulary.ts`
- `packages/work/test/work.test.ts`
- `packages/work/tsconfig.json`
- `tools/eval/src/work-cli.ts`
- `tools/eval/src/work-data.ts`
- `tools/eval/src/work-eval.ts`
- `tools/eval/src/work-generate-cli.ts`
- `tools/eval/src/work-generate.ts`
- `tools/eval/src/work-noise.ts`
- `tools/eval/src/work-wording-dev.ts`
- `tools/eval/src/work-wording-test.ts`
- `tools/eval/src/work-wording.ts`
- `tools/eval/test/work.test.ts`

File sửa:

- `packages/core/src/types.ts`, `grading/static.ts`, `grading/uncertainty.ts`, `explain/templates.vi.ts`.
- `tools/eval/src/handwriting-solutions.ts`, `handwriting.ts`, `validate-cli.ts`, `tools/eval/package.json`.
- `package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.ts`.
- `testdata/images/README.md`.

Dữ liệu/báo cáo:

- 40 file `testdata/images-synthetic-hw/*/work.json` và 40 `meta.json` cập nhật hash; 4 `1.png`, 4 `layout.json`, 4 `lines.json` thay đổi theo câu văn xuôi sửa ở vòng review.
- `testdata/work-text/{README.md,manifest.json,confusions.json}`, 1.200 thư mục mẫu × 3 JSON.
- 6 file báo cáo oracle nêu trên và báo cáo lô này.

Không sửa docs/spec.md, docs/prompts/, CLAUDE.md, AGENTS.md hoặc testdata/core. Dừng sau Lô 3.1 để review.

## Review Lô 3.1 vòng 1 — đã sửa 5/5 điểm

1. **Đã sửa — confidence và alternatives.** `tools/eval/src/work-noise.ts` đo riêng confidence B/C, sinh `charConf` theo code point NFC cho mọi dòng work-text, `conf = min(charConf)` (text rỗng: mảng rỗng, conf 0). Ký tự sạch lấy mẫu từ dòng đọc đúng conf ≥ 0,85, chặn trên 0,999999. Mỗi dòng bị nhiễu rút nhánh thầm lặng theo tỷ lệ thực đo của engine; ký tự đổi ở nhánh còn lại lấy conf < 0,85. Xóa ký tự chuyển confidence sang ký tự sống gần nhất. RNG confidence độc lập với RNG chữ nên c/d giữ cùng chữ/conf. Biến thể d dùng alternatives thật `[chữ sạch]` khi chữ khác text, không lặp text; chữ sạch ở vị trí 1. Công thức, mẫu phân phối, tử/mẫu, SHA-256 nguồn và nhãn nền lưu ở `confusions.json`; README giải thích đầy đủ.
   - B: 139 dòng đúng, 136 dòng sai, **16/136 = 11,7647%** dòng sai conf ≥ 0,85; phân phối confidence cao của dòng đúng có 72 mẫu.
   - C: 163 dòng đúng, 414 dòng sai, **12/414 = 2,8986%** dòng sai conf ≥ 0,85; phân phối confidence cao của dòng đúng có 88 mẫu.
   - Đo trên pass 1, NFC + trim, khớp nguyên văn với một dòng truth có hiệu lực cùng trang; bỏ 4 trang B thất bại. Đo trước khi sinh lại câu mô tả để giữ đúng cặp chữ đọc / nhãn của lượt đo cũ. Nhãn nền là commit `dfe4b1ee69d9e602e35e879693f85b52699f5076`; không đo lại OCR hay truy cập thiết bị.
2. **Đã sửa — quy ước bảng và fallback.** `work-wording.ts` chỉ dựng bảng khi mọi ô chưa khoanh đều có nhãn nguồn; giữ nhãn hiện tại ở ô đỉnh đang chọn, `-` chỉ cho đỉnh đã chọn từ hàng trước. Không thêm/bớt ClaimBody. Claims thưa chuyển sang họ văn xuôi cùng split, ghi `tableFallback: true` trong manifest. Corpus hiện có **80 fallback**: 40 dev-table, 40 test-notes. Test kiểm ca bảng đầy đủ, mọi dấu `-` theo bước chọn trước, mỗi ô số chưa khoanh có claim, và fixture 12 phải fallback. Bộ 1.200 mẫu vẫn chia theo 3 họ dev / 2 họ test; các mẫu fallback được ghi rõ không phải họ bảng độc lập.
3. **Đã sửa — truth văn xuôi.** `WorkTruth.prose` cùng kiểm tra bắt buộc cho dữ liệu sinh; cả 40 work.json viết tay ghi đủ dòng solution có hiệu lực ngoài lineOf, work-text ghi `[]`. `tools/eval/src/work-data.ts` có `hasGradingContent` để kiểm nhãn theo quy tắc 3, không tạo claim/parser. Hai câu mô tả chứa từ kết luận/phán đoán được sửa tại bộ sinh rồi sinh lại ảnh/lines/layout/hash tương ứng. Kiểm riêng nhãn có chỉ số v1 và nhãn S, tránh coi chữ “Dùng” là phán đoán “Đúng”. Hướng dẫn gán nhãn thật, ví dụ prose và validator đã cập nhật.
4. **Đã sửa — ba loại sai thầm lặng và câu hỏi thừa.** `compareWork` trả `silentFalseCorrect` (i), `silentFalseWrongParse` (ii), `silentFalseWrongReading` (iii), `proseAsUnchecked`. SAI sai với chữ đúng hoặc thiếu bằng chứng chữ (`readingMismatch === null`) xếp (ii); chữ khác xếp (iii). Không đếm hai lần; prose unchecked khử trùng chỉ số dòng. Báo cáo JSON/Markdown có đủ cột, danh sách từng bài sai thầm lặng và ghi chú trường hợp null. Test riêng từng loại, truth DUNG / SAI sai dòng, trường hợp đúng dòng, thiếu dòng nguồn, prose trùng chỉ số.
5. **Đã sửa — đường lặp người đưa thư và định dạng template.** Khi một đường ghép có hơn một cạnh, bộ sinh viết dãy đỉnh của từng đường và assert khớp claim `postman_duplicate`. Test đường A → B → C → D cho cả bài đúng và sai. Nhánh `CANH_KHONG_TON_TAI` đã tách `if … return …;` và `return …` thành hai dòng.

### File sửa trong vòng review này

- Core: `packages/core/src/explain/templates.vi.ts`.
- Work: `packages/work/src/{types,compare}.ts`, `packages/work/test/work.test.ts`, `packages/work/README.md`.
- Eval: `tools/eval/src/{work-noise,work-wording,work-generate,work-data,work-eval,handwriting,handwriting-solutions,validate-cli}.ts`, `tools/eval/test/work.test.ts`.
- Hướng dẫn: `testdata/work-text/README.md`, `testdata/images/README.md`.
- Dữ liệu: `testdata/work-text/{manifest,confusions}.json` và 1.200 mẫu lines/work (vocab giữ nguyên); 40 work.json/hash meta viết tay, 4 ảnh/layout/lines của các câu mô tả sửa.
- Báo cáo: ba cặp oracle `.md`/`.json` nêu trên và báo cáo lô này.

### Lệnh và kết quả sau sửa

- Đã đo lại bảng B/C trên nhãn nền trước khi sinh ảnh, không chạy model.
- `npm run eval:generate -- --set synthetic-hw`: 40 ảnh.
- `npm run eval:generate-work`: 40 truth viết tay, 1.200 mẫu chữ.
- Đã chạy lại ba báo cáo bằng `eval:work`; lần cuối gọi trực tiếp cùng `work-cli.js` sau build để cập nhật theo fallback cùng split. Dev **720/720**, test **480/480**, synthetic-hw **40/40** exact; claim, dòng nguồn, kết luận so được và bước sai đầu đều 100%. Các cột sai thầm lặng (i)/(ii)/(iii), prose unchecked và bước từ dòng gạch đều **0**.
- `npm test`: **1.279 passed, 0 failed; 56 test files passed** (gồm typecheck root/mobile).
- `npx tsc --noEmit -p packages/core/tsconfig.json`: exit 0.
- `npx tsc --noEmit -p packages/reader/tsconfig.json`: exit 0.
- `npx tsc --noEmit -p packages/work/tsconfig.json`: exit 0.
- `npx tsc --noEmit -p tools/eval/tsconfig.json`: exit 0.
- Validator synthetic-hw: **40 nhãn hợp lệ**. Các file bảo vệ và 60 fixture core không đổi.

### Quyết định & giả định sau review

- Confidence mô phỏng theo phân phối thực đo, không phải hiệu chuẩn OCR; phép ghép dòng nguyên văn có thể xem lỗi cắt/ghép dòng là đọc sai. Các tỷ lệ được cố định theo đúng nhãn nền của lượt B/C cũ, không đo với ảnh vừa thay câu.
- Không bịa nhãn số/∞ để lấp bảng thưa. Vì không có fixture core đủ claim bảng, nhánh bảng đầy đủ được kiểm bằng ca riêng; các fallback chỉ là văn xuôi đã có trong cùng split, không được quảng cáo là đa dạng họ bảng mới.
- Không đủ chữ nguồn để chứng minh lỗi đọc thì đếm bảo thủ như lỗi hiểu (ii), đúng yêu cầu review.
- Chỉ sửa đúng phạm vi Lô 3.1 vòng 1; không triển khai parser, không gọi adb, không tải model, không thêm dependency. Dừng để reviewer kiểm lại.
