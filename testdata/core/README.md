# Bộ mẫu lõi — Lô 1.6

60 bài, mỗi thư mục gồm `spec.json`, `claims.json`, `expected.json`.
Không có ảnh, AI hoặc UI trong lô này. Mỗi bài có `description` tiếng Việt
trong `expected.json` nêu ý đồ và lập luận tay dẫn tới kết quả.

## Nguồn của expected

Toàn bộ verdict, bước sai đầu tiên, mã lỗi, số then chốt và đáp án chỉ giải
được xác định bằng đếm cạnh/bậc, xét điều kiện, cộng trọng số hoặc liệt kê
các phương án nhỏ theo đặc tả **trước khi chạy đối chiếu**. Không gọi
`grade()`, `solve()` hay solver con để sinh hoặc ghi lại expected.
Các số trong JSON là hằng đã lập luận, không phải snapshot kết quả chạy.

Test chỉ đọc JSON và gọi API để đối chiếu; không ghi file hay có chế độ
cập nhật expected. Nếu xuất hiện sai khác trong tương lai, giữ nguyên oracle,
đối chiếu lại lập luận và báo reviewer quyết định trước khi thay đổi.

## Hợp đồng expected

- `description`: ý đồ và lý do toán học bằng tiếng Việt.
- `grade`: chỉ chứa `verdict`, `firstErrorStep`, `errorCode` và tùy chọn `facts`.
  `firstErrorStep: null` / `errorCode: null` khẳng định không có bước sai /
  mã lỗi; test chuẩn hóa trường không có của API sang `null` để so sánh.
  `facts` là tập con: chỉ so các trường đã ghi, cho phép API bổ sung dữ liệu.
- `solutionAnswer`: thay cho `grade` ở 11 bài chỉ giải; chỉ so các trường
  đáp án then chốt, không buộc mọi chi tiết của một lời giải cụ thể.
  Các bài này có `claims.json = []` và không được tính là thiếu bài làm.
  Riêng bài 51 chủ động chấm bài làm rỗng để kiểm tra `KHONG_DU_CAN_CU`.
- Không lưu `message`, `notes`, trace hoặc toàn bộ `Solution`/`GradeResult`.

Với dãy bậc có lời giải, test còn đếm trực tiếp số đầu mút cạnh trong đồ thị
được dựng để kiểm tra dãy bậc, tính khuyên hai lần; không dùng hàm tính bậc
của core và không ép một đồ thị dựng duy nhất.

## Độ phủ

| Nhóm bài | Mã bài |
| --- | --- |
| Đỉnh, cạnh, cô lập, tên cạnh, đa đồ thị | 01, 02, 52 |
| Bậc, tổng bậc, dãy bậc đơn/đa | 03–05, 18, 21, 48, 53 |
| Đường đi, liên thông | 06, 07, 22, 30, 42, 50, 54 |
| Euler | 08, 09, 26, 27, 31, 33, 45, 55 |
| Hamilton, Dirac, Ore | 10, 11, 24, 25, 28, 34, 56 |
| Ngắn nhất, Dijkstra | 12, 17, 23, 29, 32, 36–38, 40, 41, 43, 44, 49, 57 |
| TSP | 13, 39, 46, 58 |
| Người đưa thư | 14–16, 35, 47, 59, 60 |
| Câu đúng/sai bốn ý, trắc nghiệm bốn lựa chọn | 19, 20 |

| Trạng thái | Số bài | Mã bài |
| --- | ---: | --- |
| DUNG | 18 | 01–03, 06–20 |
| SAI | 27 | 21–47 |
| CAN_XAC_NHAN | 3 | 48–50 |
| KHONG_DU_CAN_CU | 1 | 51 |
| Chỉ giải | 11 | 04, 05, 52–60 |

Trong 45 bài đúng/sai rõ ràng, tỉ lệ là 40% đúng / 60% sai.
Phủ cả `tu_luan`, `tra_loi_ngan`, `dung_sai`, `trac_nghiem`.

| Mã lỗi | Số bài SAI | Mã bài |
| --- | ---: | --- |
| SAI_PHEP_TINH | 3 | 21–23 |
| SAI_DIEU_KIEN | 3 | 24–26 |
| BO_SOT | 3 | 27–29 |
| CANH_KHONG_TON_TAI | 3 | 30–32 |
| LAP | 3 | 33–35 |
| NHAM_THUAT_TOAN | 3 | 36–38 |
| SAI_LUA_CHON | 3 | 39–41 |
| KET_LUAN_KHONG_SUY_RA | 3 | 42–44 |
| HIEU_SAI_DE | 3 | 45–47 |

Các bài nhầm thuật toán tách ba tình huống: khớp cả Prim và láng giềng (36),
chỉ Prim (37), chỉ láng giềng (38). Chúng đều sai bước 3 do so nhãn tích lũy.

## Ca khó và quyết định

- Nhiều lời giải đúng: đường đi 06, Euler 08–09, Hamilton 10–11;
  các bài đi ngược chiều hoặc khác đường ưu tiên vẫn phải đúng.
- Đồng hạng: Dijkstra 12, TSP 13 (học sinh dài 15, lượt ưu tiên dài 16),
  ghép cặp người đưa thư 14.
- Không có lời giải: dãy bậc đơn 04, đường đi 54, Königsberg 55,
  Hamilton 56, ngắn nhất 57. Bài 55 có bốn bậc lẻ 5,3,3,3.
- Khuyên và đa cạnh: 01, 03, 09, 21, 48, 52–53. Bài 09 cũng kiểm tra
  Euler bỏ qua đỉnh cô lập, trong khi liên thông thông thường phải xét nó (02).
- Chỉ có đáp số: đúng 17–18, sai 44. Áp dụng quy tắc cụ thể ở đặc tả
  **6.1.5** và prompt 01: chấm đáp số, kèm lưu ý không có bước giải để kiểm tra.
  Bảng tổng quan 3.2 có liệt kê thiếu bước trong trạng thái thiếu căn cứ;
  ở các bài có đáp số kiểm tra được, quy tắc cụ thể trên được áp dụng.
- Dữ liệu đọc chưa chắc: 48 mô phỏng chữ/ảnh mờ bằng `conf = 0.6`;
  49 có trọng số hai khả năng, 50 có số ID cạnh không khớp số lần chuyển.
  Đây là JSON sau đọc ảnh, không kiểm thử trực tiếp ảnh mờ/nghiêng.
- Bước sai đầu tiên: 21 có lỗi tiếp theo nhưng phải giữ bước 2;
  24 có bước trước đúng và suy luận sai; 32 có số đúng nhưng tiền nhiệm sai;
  43 có khoảng cách đúng nhưng truy vết sai.
- TSP tham lam không tối ưu: 58 liệt kê tay ba chu trình không kể đảo chiều,
  cho tổng 16, 9, 15; tối ưu 9, lượt tham lam ưu tiên 16, chênh 7.
- Người đưa thư: 16 mọi bậc chẵn; 15, 59 hai đỉnh lẻ nhưng xuất phát tại B
  chẵn (tổng 5 + 5 = 10); 14, 60 bốn đỉnh lẻ (tổng 6 + 2 = 8).
- Phạm vi thay đổi chỉ gồm bộ mẫu, runner và tài liệu của bộ mẫu;
  không sửa code sản phẩm hoặc tài liệu đặc tả/prompt.

## Chạy và kết quả đối chiếu

Từ thư mục gốc: `npm test` (bao gồm typecheck).
Runner: `packages/core/test/core-corpus.test.ts` tự đọc mọi bộ ba JSON
qua raw glob của Vite đã có cùng Vitest, không thêm dependency.
Runner kiểm tra cấu trúc, tối thiểu 40 bài, đủ nhóm/trạng thái/dạng câu hỏi,
mỗi mã lỗi ít nhất 3 bài SAI và giữ các ca khó bắt buộc.
Mỗi bài là một test riêng để tên lỗi chỉ rõ thư mục và mô tả suy luận.

Đối chiếu lần đầu: **60/60 bài khớp lập luận tay**, không có sai khác toán học
cần reviewer quyết định; không sửa expected sau khi chạy API.
