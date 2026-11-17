# Bàn giao Lô 2.10 — Bộ hình khó và chỉ số đồ thị

Đã hoàn tất riêng Lô 2.10. Không gọi `adb`, không tải hoặc chạy model; sinh ảnh và kiểm thử hoàn toàn cục bộ. Chưa triển khai bộ đọc D của Lô 2.11.

## Kết quả

- 320 ảnh tổng hợp: 240 vùng hình, 80 trang vở, dùng đủ 60 nguồn core và 20 đồ thị sinh có seed. Có 44 nội dung đồ thị khác nhau sau chuẩn hóa.
- `dev`: 204 ảnh (153 vùng hình, 51 trang); `test`: 116 ảnh (87 vùng hình, 29 trang). Chia theo nội dung đồ thị và seed, không trộn biến thể giữa hai tập.
- Chú thích lưu tâm/đường bao đỉnh, box chữ, polyline cạnh, trọng số/tên, giao cắt không phải đỉnh trong tọa độ ảnh cuối. Có tham số sinh và SHA-256 từng artifact.
- Thêm chỉ số đỉnh, multiset cạnh, trọng số, khuyên/đa cạnh; báo cáo tách biến thể và split, giữ tỉ lệ đúng/sai thầm lặng phần đồ thị độc lập với câu hỏi.
- Import kết quả thiết bị chấp nhận graph có trọng số hữu hạn ≤ 0, vẫn kiểm cấu trúc/id/đầu mút. Không đổi `0` thành thiếu trọng số. `spec` tiếp tục phải qua `validateSpec`.
- Ca hồi quy lấy nguyên một bản ghi có `w: 0` từ file xuất vivo sẵn có: F1 cấu trúc = 1, độ đúng trọng số = 0, giữ issue `nonpositive_weight`. Test thêm trọng số âm và từ chối cấu trúc hỏng.

## File tạo/sửa

Tạo:

- `packages/reader/src/graph-metrics.ts`.
- `packages/reader/test/graph-metrics.test.ts`.
- `tools/eval/src/figure-geometry.ts`, `tools/eval/src/figures.ts`.
- `tools/eval/test/figures.test.ts`.
- `tools/eval/test/fixtures/device-vivo-w0.json`, `tools/eval/test/fixtures/README.md`.
- `testdata/images-synthetic-fig/README.md` và 320 thư mục mẫu, mỗi thư mục có `1.jpg`, `truth.json`, `figure.json`, `lines.json`, `source.svg`, `meta.json`.
- Báo cáo bàn giao này.

Sửa:

- `packages/reader/src/compare.ts`, `packages/reader/src/types.ts`, `packages/reader/src/index.ts`.
- `tools/eval/src/dataset.ts`, `tools/eval/src/generate-cli.ts`, `tools/eval/src/validate-cli.ts`, `tools/eval/src/pack.ts`, `tools/eval/src/cli.ts`.
- `tools/eval/src/device.ts`, `tools/eval/src/report.ts`.
- `tools/eval/test/eval.test.ts`, `tools/eval/README.md`.

## Kiểm tra

`npm test` (gồm typecheck repo và mobile):

```text
Test Files  45 passed (45)
     Tests  1132 passed (1132)
```

**1132 pass / 0 fail.** Build TypeScript qua toàn bộ các workspace trong `npm run build` thành công qua các lệnh eval bên dưới.

- `npm run eval:generate -- --set synthetic-fig`: sinh 320 ảnh.
- `npm run eval:validate -- synthetic-fig`: 320 nhãn hợp lệ, hình học đúng kích thước ảnh và split đúng khóa.
- `npm run eval:pack -- --set synthetic-fig`: đóng gói 320 ảnh và `ids.json`.
- `npm run eval:pack -- --set synthetic-fig --split test`: đóng gói 116 ảnh và `ids.json`.
- `npm run eval:read -- --engine fake --set synthetic-fig --split dev --mode graph`: chạy 204 ảnh, xuất JSON/Markdown trong `reports/.fake/`. Đây chỉ là kiểm pipeline với truth, không phải số đo nhận dạng.
- `git diff --check`: không lỗi whitespace. Đã xem contact sheet mẫu vùng hình/trang vở, gồm khuyên, đa cạnh và ảnh 20 đỉnh.

Test kiểm đủ nguồn core, hash artifact, tính xác định khi sinh lại, nhãn/trọng số và tọa độ sau biến đổi; cạnh/khuyên/đa cạnh khớp truth; box chữ trong ảnh và gần polyline; chia tập không rò đồ thị; đóng gói chỉ ảnh/id; chỉ số và hồi quy file xuất thực.

## Quyết định & giả định

1. Truth dùng `task: elements`, `questionFormat: tu_luan`, bỏ `uncertain` và giữ nguyên graph core. Lô này chỉ xét phần đồ thị.
2. Hash chia tập chuẩn hóa nhãn, bỏ id/thứ tự nhưng giữ trọng số/tên và số lần lặp cạnh. Fixture trùng đồ thị vào cùng split. Tập `test` không dùng chỉnh ngưỡng.
3. Độ đúng trọng số ghép các giá trị bằng nhau trước trong từng nhóm cạnh cùng đầu mút. Không trọng số là `null`; mẫu số là số cạnh khớp cấu trúc. Khuyên/đa cạnh xét số lượng, trọng số và tên ở các nhóm tương ứng, kể cả nhóm đọc thừa. Mẫu số 0 báo N/A.
4. Dùng lại hai font OFL và dàn trang `synthetic-hw`; không thêm dependency/font/model. Glyph raster hóa từ fontfile, box bao glyph thực tế gồm dấu tiếng Việt.
5. Ảnh 1200 × 1000 hoặc 1000 × 1440 có seed và biến đổi trong metadata. Đây là dữ liệu phát triển tổng hợp, chưa chứng minh chất lượng trên ảnh học sinh thật.

Dừng tại đây để Claude review trước lô tiếp theo.
