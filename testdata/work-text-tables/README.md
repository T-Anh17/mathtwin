# Corpus bảng Dijkstra — Lô 3.3

Sinh bằng `npm run eval:generate-work-tables`. Không cần model, ảnh hay mạng.

Nguồn là mọi đề `shortest_path` trong `testdata/core` và 10 đồ thị đầy đủ có seed `330100..330109`, 4–8 đỉnh, có đồng hạng. Vết chuẩn từ `solveDijkstra`; thêm thứ tự chọn đồng hạng khác, cộng sai, giữ nhãn cũ, chọn đỉnh không nhỏ nhất và chọn theo Prim khi đề có tình huống phù hợp. Các mã lỗi và `expected` lấy từ `grade()` trên claims mà bộ dựng bảng ghi trực tiếp, không qua parser.

Chia theo cách viết, không chia theo đồ thị: ba họ dev nằm trong `tools/eval/src/work-table-dev.ts`, hai họ test nằm trong file riêng. Không dùng họ test để chỉnh parser. Mỗi họ có biến thể a sạch, b mất dấu có seed, c nhầm ký tự B/C, d nhiễu và alternatives. Dùng lại nguyên `testdata/work-text/confusions.json`, gồm nguồn và phân bố confidence đã đo; chưa xử lý charConf/alternatives trong parser Lô 3.3.

`manifest.json` ghi nguồn đề, họ, split, seed, mode, engine nhiễu và biến thể. Mỗi thư mục mẫu chứa `spec.json`, `vocab.json`, `lines.json`, `work.json`. Từ vựng không chứa trọng số, id nội bộ hay lời giải. Claims giữ id nội bộ tại biên chấm; chữ chỉ in nhãn hiển thị.

Ô `-` chỉ xuất hiện ở đỉnh được chọn trong một hàng trước. Đỉnh chưa tới được ghi `∞`, không ghi `-`. Kiểm thử dev kiểm bất biến này, mọi dạng ô, thứ tự đồng hạng, các mã lỗi và độ trùng claims độc lập với parser.

Đo bằng `npm run eval:work -- --set work-text-tables --lines truth --split dev --variant a --parser real` (đổi split/variant khi cần). Split test chỉ đo một lần sau khi chốt parser; chỉ xem số tổng. Dữ liệu là chữ tổng hợp, không chứng minh độ chính xác từ ảnh thật.
