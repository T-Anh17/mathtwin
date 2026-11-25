# Đo OCR trên ảnh mô phỏng chữ viết tay — 2026-11-24

Đã thử **46/46 trang**. Đọc được 45 trang và đủ trang của 39/40 bài.

B cục bộ Qwen3-VL-2B Q4_K_M, CPU 4 luồng, cạnh ảnh tối đa 768 px. Máy tính win32 x64; Intel(R) Core(TM) i7-8700 CPU @ 3.20GHz; 31.9 GiB RAM; Node v22.23.4.
Thời gian đọc trang thành công gồm giải mã ảnh và suy luận. p50 88.5 s, p90 135.0 s.

Văn bản tham chiếu lấy từ labels.json (0/46 nhãn có cờ verified). Các tỷ lệ đo mức khớp với văn bản này. Sai lệch giữa chữ trong ảnh và văn bản dùng để sinh ảnh cũng làm tăng số lỗi.
Nguồn ảnh: `C:\Users\arthur.anh\Documents\Codex\2026-11-18\b-n-l-gi-o-vi\outputs\handwriting-prompts\images\da-soat`; nhãn: `C:\Users\arthur.anh\Documents\Codex\2026-11-18\b-n-l-gi-o-vi\outputs\handwriting-prompts\labels.json`. Quyền dùng: Người dùng cấp quyền chỉ đọc để đo; ảnh không được chép vào repo. Chưa được xác minh. SHA-256 từng ảnh nằm ở trường `rows[].sha256` của JSON.
Chuẩn hóa NFC và khoảng trắng, bỏ vạch cột trong văn bản tham chiếu, giữ dấu tiếng Việt và dấu câu. So vùng bằng căn dòng theo văn bản. Nhãn và trọng số vẽ riêng trên hình có thể được tính như chữ thêm. Trang lỗi đọc được tính như đầu ra rỗng.

| Phần | CER | WER | Lỗi token số |
| --- | ---: | ---: | ---: |
| Cả trang | 16.29% (3676/22565) | 29.49% (1674/5676) | 20.65% (121/586) |
| Đề | 9.71% (587/6048) | 20.45% (298/1457) | 10.53% (14/133) |
| Lời giải | 16.47% (2713/16477) | 28.21% (1190/4219) | 10.60% (48/453) |

Dòng mất toàn bộ dấu tiếng Việt (căn dòng đơn điệu sau khi bỏ dấu, không dùng để sửa OCR): **27/307** dòng trên **7/46** trang; **6** dòng có conf ≥0,85. Đây là rủi ro đọc sai có conf cao.

| Trang | CER | WER | Thời gian (s) | Trạng thái |
| --- | ---: | ---: | ---: | --- |
| bai_01_p1.png | 8.02% (26/324) | 26.83% (22/82) | 135.0 | Đã đọc |
| bai_02_p1.png | 5.11% (14/274) | 10.96% (8/73) | 117.6 | Đã đọc |
| bai_03_p1.png | 2.87% (11/383) | 5.71% (6/105) | 124.8 | Đã đọc |
| bai_04_p1.png | 9.17% (21/229) | 40.63% (26/64) | 96.8 | Đã đọc |
| bai_05_p1.png | 2.20% (7/318) | 8.14% (7/86) | 92.4 | Đã đọc |
| bai_06_p1.png | 9.03% (25/277) | 16.25% (13/80) | 63.8 | Đã đọc |
| bai_07_p1.png | 32.41% (47/145) | 80.00% (32/40) | 64.7 | Đã đọc |
| bai_08_p1.png | 10.57% (24/227) | 10.17% (6/59) | 56.8 | Đã đọc |
| bai_09_p1.png | 7.00% (24/343) | 24.18% (22/91) | 63.4 | Đã đọc |
| bai_10_p1.png | 5.99% (29/484) | 21.97% (29/132) | 84.0 | Đã đọc |
| bai_11_p1.png | 30.83% (41/133) | 76.47% (26/34) | 76.7 | Đã đọc |
| bai_12_p1.png | 5.48% (17/310) | 18.75% (15/80) | 70.7 | Đã đọc |
| bai_13_p1.png | 4.05% (17/420) | 8.82% (9/102) | 88.7 | Đã đọc |
| bai_14_p1.png | 1.52% (7/461) | 6.03% (7/116) | 86.7 | Đã đọc |
| bai_15_p1.png | 3.54% (8/226) | 7.41% (4/54) | 67.7 | Đã đọc |
| bai_16_p1.png | 26.25% (110/419) | 82.18% (83/101) | 76.0 | Đã đọc |
| bai_17_p1.png | 6.11% (24/393) | 22.00% (22/100) | 70.8 | Đã đọc |
| bai_18_p1.png | 4.42% (15/339) | 10.34% (9/87) | 93.8 | Đã đọc |
| bai_19_p1.png | 4.56% (26/570) | 11.03% (16/145) | 95.8 | Đã đọc |
| bai_20_p1.png | 5.00% (35/700) | 6.51% (11/169) | 88.4 | Đã đọc |
| bai_21_p1.png | 3.47% (13/375) | 10.47% (9/86) | 67.9 | Đã đọc |
| bai_22_p1.png | 10.43% (12/115) | 26.92% (7/26) | 48.3 | Đã đọc |
| bai_23_p1.png | 24.92% (74/297) | 86.76% (59/68) | 67.7 | Đã đọc |
| bai_24_p1.png | 1.06% (7/661) | 2.52% (4/159) | 71.1 | Đã đọc |
| bai_25_p1.png | 8.44% (34/403) | 13.79% (12/87) | 90.3 | Đã đọc |
| bai_26_p1.png | 22.31% (199/892) | 62.56% (137/219) | 123.9 | Đã đọc |
| bai_26_p2.png | 7.61% (45/591) | 23.24% (33/142) | 110.5 | Đã đọc |
| bai_27_p1.png | 11.42% (91/797) | 28.04% (53/189) | 129.1 | Đã đọc |
| bai_27_p2.png | 7.20% (44/611) | 25.32% (39/154) | 66.1 | Đã đọc |
| bai_28_p1.png | 89.62% (794/886) | 89.45% (195/218) | 37.7 | Đã đọc |
| bai_28_p2.png | 6.17% (36/583) | 23.78% (34/143) | 67.0 | Đã đọc |
| bai_29_p1.png | 100.00% (858/858) | 100.00% (203/203) | 177.5 | repetition_loop/repetition_loop |
| bai_29_p2.png | 4.69% (18/384) | 15.79% (15/95) | 53.7 | Đã đọc |
| bai_30_p1.png | 42.29% (329/778) | 59.26% (112/189) | 132.6 | Đã đọc |
| bai_30_p2.png | 6.49% (39/601) | 22.52% (34/151) | 83.5 | Đã đọc |
| bai_31_p1.png | 19.16% (132/689) | 53.71% (94/175) | 137.4 | Đã đọc |
| bai_32_p1.png | 8.69% (71/817) | 14.50% (29/200) | 151.3 | Đã đọc |
| bai_33_p1.png | 10.70% (64/598) | 25.33% (38/150) | 171.1 | Đã đọc |
| bai_33_p2.png | 1.41% (4/283) | 6.25% (4/64) | 128.9 | Đã đọc |
| bai_34_p1.png | 8.56% (48/561) | 20.42% (29/142) | 127.3 | Đã đọc |
| bai_35_p1.png | 6.20% (34/548) | 16.08% (23/143) | 123.3 | Đã đọc |
| bai_36_p1.png | 12.23% (56/458) | 24.17% (29/120) | 88.5 | Đã đọc |
| bai_37_p1.png | 6.64% (50/753) | 20.59% (42/204) | 136.1 | Đã đọc |
| bai_38_p1.png | 4.77% (31/650) | 8.52% (15/176) | 134.3 | Đã đọc |
| bai_39_p1.png | 3.65% (30/823) | 9.21% (21/228) | 86.4 | Đã đọc |
| bai_40_p1.png | 6.06% (35/578) | 21.38% (31/145) | 96.2 | Đã đọc |

Phạm vi là đọc chữ trên trang. Đo cấu trúc đồ thị và các chỉ số chấm cần nhãn đồ thị, chuỗi bước và kết quả đã được đối chiếu với ảnh. Nghiệm thu MVP vẫn cần bài làm viết tay thật có nhãn.
