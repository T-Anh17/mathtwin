# Đo OCR trên ảnh mô phỏng chữ viết tay — 2026-11-19

Đã thử **46/46 trang**. Đọc được 46 trang và đủ trang của 40/40 bài.

B cục bộ Qwen3-VL-2B Q4_K_M, CPU 4 luồng, cạnh ảnh tối đa 768 px. Máy tính win32 x64; Intel(R) Core(TM) i7-8700 CPU @ 3.20GHz; 31.9 GiB RAM; Node v22.23.4.
Thời gian đọc trang thành công gồm giải mã ảnh và suy luận. p50 75.3 s, p90 122.6 s.

Văn bản tham chiếu lấy từ labels.json (0/46 nhãn có cờ verified). Các tỷ lệ đo mức khớp với văn bản này. Sai lệch giữa chữ trong ảnh và văn bản dùng để sinh ảnh cũng làm tăng số lỗi.
Nguồn ảnh: `C:\Users\arthur.anh\Documents\Codex\2026-11-18\b-n-l-gi-o-vi\outputs\handwriting-prompts\images\da-soat`; nhãn: `C:\Users\arthur.anh\Documents\Codex\2026-11-18\b-n-l-gi-o-vi\outputs\handwriting-prompts\labels.json`. Quyền dùng: Người dùng cấp quyền chỉ đọc để đo; ảnh không được chép vào repo. Chưa được xác minh. SHA-256 từng ảnh nằm ở trường `rows[].sha256` của JSON.
Chuẩn hóa NFC và khoảng trắng, bỏ vạch cột trong văn bản tham chiếu, giữ dấu tiếng Việt và dấu câu. So vùng bằng căn dòng theo văn bản. Nhãn và trọng số vẽ riêng trên hình có thể được tính như chữ thêm. Trang lỗi đọc được tính như đầu ra rỗng.

| Phần | CER | WER | Lỗi token số |
| --- | ---: | ---: | ---: |
| Cả trang | 12.13% (2738/22565) | 23.33% (1324/5676) | 19.97% (117/586) |
| Đề | 7.79% (471/6048) | 16.33% (238/1457) | 15.79% (21/133) |
| Lời giải | 11.51% (1897/16477) | 21.43% (904/4219) | 9.93% (45/453) |

Dòng mất toàn bộ dấu tiếng Việt (căn dòng đơn điệu sau khi bỏ dấu, không dùng để sửa OCR): **7/316** dòng trên **5/46** trang; **4** dòng có conf ≥0,85. Đây là rủi ro đọc sai có conf cao.

| Trang | CER | WER | Thời gian (s) | Trạng thái |
| --- | ---: | ---: | ---: | --- |
| bai_01_p1.png | 8.02% (26/324) | 26.83% (22/82) | 162.5 | Đã đọc |
| bai_02_p1.png | 6.57% (18/274) | 13.70% (10/73) | 83.6 | Đã đọc |
| bai_03_p1.png | 2.87% (11/383) | 5.71% (6/105) | 122.6 | Đã đọc |
| bai_04_p1.png | 9.17% (21/229) | 40.63% (26/64) | 97.1 | Đã đọc |
| bai_05_p1.png | 7.86% (25/318) | 31.40% (27/86) | 64.5 | Đã đọc |
| bai_06_p1.png | 9.75% (27/277) | 18.75% (15/80) | 103.3 | Đã đọc |
| bai_07_p1.png | 32.41% (47/145) | 80.00% (32/40) | 57.8 | Đã đọc |
| bai_08_p1.png | 10.57% (24/227) | 10.17% (6/59) | 46.7 | Đã đọc |
| bai_09_p1.png | 7.00% (24/343) | 20.88% (19/91) | 51.2 | Đã đọc |
| bai_10_p1.png | 7.44% (36/484) | 27.27% (36/132) | 78.2 | Đã đọc |
| bai_11_p1.png | 10.53% (14/133) | 23.53% (8/34) | 70.8 | Đã đọc |
| bai_12_p1.png | 5.48% (17/310) | 18.75% (15/80) | 64.7 | Đã đọc |
| bai_13_p1.png | 4.05% (17/420) | 8.82% (9/102) | 72.5 | Đã đọc |
| bai_14_p1.png | 1.52% (7/461) | 6.03% (7/116) | 68.0 | Đã đọc |
| bai_15_p1.png | 3.54% (8/226) | 7.41% (4/54) | 54.0 | Đã đọc |
| bai_16_p1.png | 13.60% (57/419) | 47.52% (48/101) | 55.2 | Đã đọc |
| bai_17_p1.png | 7.12% (28/393) | 22.00% (22/100) | 75.1 | Đã đọc |
| bai_18_p1.png | 4.13% (14/339) | 9.20% (8/87) | 73.1 | Đã đọc |
| bai_19_p1.png | 7.19% (41/570) | 11.72% (17/145) | 82.5 | Đã đọc |
| bai_20_p1.png | 5.29% (37/700) | 6.51% (11/169) | 80.0 | Đã đọc |
| bai_21_p1.png | 3.47% (13/375) | 10.47% (9/86) | 57.2 | Đã đọc |
| bai_22_p1.png | 12.17% (14/115) | 34.62% (9/26) | 51.3 | Đã đọc |
| bai_23_p1.png | 4.71% (14/297) | 13.24% (9/68) | 70.5 | Đã đọc |
| bai_24_p1.png | 1.06% (7/661) | 2.52% (4/159) | 75.3 | Đã đọc |
| bai_25_p1.png | 8.44% (34/403) | 13.79% (12/87) | 85.7 | Đã đọc |
| bai_26_p1.png | 7.51% (67/892) | 18.26% (40/219) | 73.8 | Đã đọc |
| bai_26_p2.png | 7.95% (47/591) | 24.65% (35/142) | 88.8 | Đã đọc |
| bai_27_p1.png | 8.53% (68/797) | 23.81% (45/189) | 89.0 | Đã đọc |
| bai_27_p2.png | 7.36% (45/611) | 25.97% (40/154) | 69.4 | Đã đọc |
| bai_28_p1.png | 89.62% (794/886) | 89.45% (195/218) | 36.7 | Đã đọc |
| bai_28_p2.png | 6.35% (37/583) | 23.08% (33/143) | 60.9 | Đã đọc |
| bai_29_p1.png | 8.39% (72/858) | 20.69% (42/203) | 84.4 | Đã đọc |
| bai_29_p2.png | 4.69% (18/384) | 15.79% (15/95) | 44.4 | Đã đọc |
| bai_30_p1.png | 43.06% (335/778) | 61.38% (116/189) | 121.1 | Đã đọc |
| bai_30_p2.png | 7.15% (43/601) | 23.84% (36/151) | 68.7 | Đã đọc |
| bai_31_p1.png | 5.37% (37/689) | 12.00% (21/175) | 119.0 | Đã đọc |
| bai_32_p1.png | 7.71% (63/817) | 13.50% (27/200) | 116.6 | Đã đọc |
| bai_33_p1.png | 7.86% (47/598) | 18.67% (28/150) | 118.2 | Đã đọc |
| bai_33_p2.png | 0.71% (2/283) | 3.13% (2/64) | 143.3 | Đã đọc |
| bai_34_p1.png | 5.35% (30/561) | 14.79% (21/142) | 128.3 | Đã đọc |
| bai_35_p1.png | 29.38% (161/548) | 37.06% (53/143) | 116.3 | Đã đọc |
| bai_36_p1.png | 15.28% (70/458) | 30.83% (37/120) | 81.3 | Đã đọc |
| bai_37_p1.png | 8.50% (64/753) | 24.02% (49/204) | 139.7 | Đã đọc |
| bai_38_p1.png | 7.54% (49/650) | 20.45% (36/176) | 119.4 | Đã đọc |
| bai_39_p1.png | 8.63% (71/823) | 13.16% (30/228) | 78.5 | Đã đọc |
| bai_40_p1.png | 6.40% (37/578) | 22.07% (32/145) | 74.6 | Đã đọc |

Phạm vi là đọc chữ trên trang. Đo cấu trúc đồ thị và các chỉ số chấm cần nhãn đồ thị, chuỗi bước và kết quả đã được đối chiếu với ảnh. Nghiệm thu MVP vẫn cần bài làm viết tay thật có nhãn.
