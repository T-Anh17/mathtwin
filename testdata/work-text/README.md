# Bộ chữ bài làm — Lô 3.1

1.200 mẫu = 60 bài core × 5 họ cách viết × 4 biến thể. `manifest.json` ghi nguồn bài, họ, split, seed, engine tạo nhiễu và cờ `solveOnly`, `tableFallback`. Mỗi thư mục mẫu chỉ có `lines.json`, `work.json`, `vocab.json`; không có ảnh. Đề lấy từ `testdata/core/<coreFixture>/spec.json`.

- `dev`: `dev-direct`, `dev-symbolic`, `dev-table` trong `tools/eval/src/work-wording-dev.ts`.
- `test`: `test-student`, `test-notes` trong file riêng `work-wording-test.ts`. Không dùng file này khi chỉnh parser. Cùng 60 bài xuất hiện ở cả hai split; chia theo họ, không chia theo bài.
- Họ bảng chỉ dựng bảng khi các claim gốc đủ nhãn hiện tại cho mọi đỉnh chưa khoanh. Cột đầu ghi đỉnh chọn; ô của đỉnh đang chọn giữ nhãn đã viết ở hàng trước (nguồn ban đầu là 0); `-` chỉ dành cho đỉnh đã chọn ở hàng trước. Mỗi ô số của đỉnh chưa khoanh tương ứng đúng một `dijkstra_label`. Không thêm/bớt claim. Claims thưa chuyển sang câu của `dev-direct` trong dev, `test-student` trong test, ghi `tableFallback: true` nhưng giữ id họ/split để đối chiếu. Cả 10 fixture có bước chọn trong core hiện đều thưa, nên 40 mẫu `dev-table` và 40 mẫu `test-notes` tương ứng dùng fallback; nhánh bảng đầy đủ được kiểm bằng fixture trong test, bảng ảnh synthetic-hw vẫn có riêng.
- `a`: sạch. `b`: mỗi code point có xác suất 0,5 bỏ dấu. `c`: thay/chèn/xóa theo tần suất lỗi đã đo của B hoặc C. `d`: cùng chữ nhiễu như c; nếu khác chữ sạch thì `alternatives[0]` là chữ sạch (vị trí 1), không chứa chính `text` hoặc phần tử trùng. Nếu chữ không đổi thì alternatives rỗng. Truth và thứ tự nguồn không đổi.
- Mọi dòng có `charConf` theo code point của `text` NFC và `conf = min(charConf)`; dòng rỗng có mảng rỗng và conf 0. `work.json.prose` bắt buộc, hiện là `[]` vì mọi dòng văn xuôi sinh từ claim.


Giữ nguyên ClaimBody, step, conf và box từ `claims.json`; chỉ đổi raw thành câu sạch của họ tương ứng. Giữ nhãn chấm verdict/bước/mã lỗi từ `expected.json`. Mười một bài 04, 05, 52–60 chỉ có solutionAnswer và claims rỗng: đánh dấu `solveOnly`, lấy verdict `KHONG_DU_CAN_CU` khi core chấm mảng rỗng. Không bịa thêm bài làm. Ca 51 cũng giữ bài làm rỗng theo nhãn có sẵn.

`confusions.json` là bảng đo đã chốt, đủ tái sinh mà không cần các file debug riêng tư. B: file `reports/.debug/device-vivo-app-b768-2026-11-17-40.json`, pass 1; 36 trang có chữ, 4 lượt thất bại được ghi `failedIds`, không biến lỗi chạy thành nhầm ký tự. C: chữ trong `reports/.debug/read-eval-offline-vietocr-onnx-2026-11-16-synthetic-hw.json`, cùng lượt với báo cáo `reports/read-eval-offline-vietocr-onnx-2026-11-16.json` (báo cáo tổng hợp không chứa chữ). Ghi đường dẫn và SHA-256 cả debug lẫn báo cáo C.

Đo bằng Levenshtein code point sau NFC trên toàn trang, nối các dòng có hiệu lực bằng dấu cách; có cả đề, hình, bảng và bài làm, bỏ dòng truth đã gạch. Khi hòa ưu tiên diagonal, xóa, chèn lúc truy ngược. Không dùng alternatives hay kết quả chấm. Đây là bảng lỗi tổng hợp với căn ký tự, không phải ground truth căn dòng; có thể gồm lỗi phát hiện/bỏ dòng. Nhiễu có seed xorshift32; tần suất thay/xóa chia theo số lần ký tự nguồn xuất hiện, chèn chia theo tổng ký tự nguồn. Không phải mô phỏng phân phối lỗi thực tế chính xác.

Confidence lấy từ pass 1 của chính hai nguồn B/C trên. So mỗi dòng dự đoán còn hiệu lực với mọi dòng truth còn hiệu lực cùng trang, NFC + trim; khớp nguyên văn là đúng, còn lại sai; bỏ trang không có chữ dự đoán. Đo trước khi sửa hai câu văn xuôi ở vòng review này: B 139 dòng đúng, 136 dòng sai; 16/136 dòng sai có conf ≥ 0,85 (**11,7647%**). C 163 dòng đúng, 414 dòng sai; 12/414 có conf ≥ 0,85 (**2,8986%**). Đây là tỷ lệ trên dòng, không phải trên ký tự; căn dòng không gán nhãn thủ công. `confidence` lưu tử/mẫu, tỷ lệ và các mẫu confidence thực đo. `sources.referenceSha256` băm lần lượt id + newline + bytes lines.json của các trang có chữ, theo thứ tự nguồn; các nhãn nền này thuộc commit `dfe4b1ee69d9e602e35e879693f85b52699f5076`, trước khi sinh lại ảnh vòng review. Hai file debug và báo cáo C giữ SHA-256 cũ để truy vết.

Ký tự không đổi lấy mẫu đều từ phân phối confidence của dòng đọc đúng có conf ≥ 0,85 (B 72 mẫu, C 88), chặn trên 0,999999 để không mặc định 1. Mỗi dòng có ký tự đổi rút một Bernoulli với p = tỷ lệ sai confidence cao của engine: nhánh thầm lặng lấy mẫu từ dòng sai conf ≥ 0,85; nhánh còn lại lấy mẫu từ dòng sai conf < 0,85. Ký tự bị thay/chèn nhận confidence nhánh đó. Ký tự bị xóa truyền confidence sang ký tự sống gần nhất (bên phải, nếu hết thì bên trái). Vị trí đổi tìm bằng Levenshtein code point NFC, giữ cùng ưu tiên hòa. RNG confidence riêng = xorshift32(seed XOR 0x434f4e46); không làm thay đổi RNG sinh chữ, c và d có cùng chữ/conf. Công thức đầy đủ cũng lưu trong `confusions.json`. Đây là mô phỏng để kiểm cổng hỏi lại, chưa phải confidence OCR đã hiệu chuẩn.

Tái sinh từ bảng đã chốt, không tải model:

```sh
npm run eval:generate -- --set synthetic-hw
npm run eval:generate-work
# Chỉ đo lại khi có debug và đúng phiên bản nhãn nền tương ứng:
npm run eval:generate-work -- --measure-confusions
npm run eval:work -- --set work-text --lines truth --split dev
npm run eval:work -- --set work-text --lines truth --split test
npm run eval:work -- --set synthetic-hw --lines truth
```

Lô 3.1 luôn dùng parser oracle trả claims truth. 100% chỉ chứng minh bộ đo hoạt động. CLI nhận `--lines device <file>` để nạp chữ đã xuất và `--lines engine oracle` để kiểm nhánh engine, vẫn dùng claims truth; không coi đó là đánh giá B/C. Engine thật có thể truyền vào `evaluateWork` qua registry `TextReader`, CLI lô này không khởi chạy model. Work-text chỉ nhận nguồn truth vì không có ảnh. Bộ real rỗng báo lỗi, không tạo tỷ lệ giả.
