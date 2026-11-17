# Lô 2.11 — D + glyph oracle

Ảnh tổng hợp, split test; tự tìm vùng hình. Không dùng truth để chọn vùng, đỉnh hay cạnh. Oracle chỉ trả chữ cho crop CV đề xuất.

Cấu trúc (nhãn + multiset {u,v}, bỏ trọng số/tên cạnh): 1/116; F1 cạnh 0.3466.

Bảng dưới chấm toàn bộ đồ thị, gồm trọng số/tên cạnh. D không đọc câu hỏi; missing_question không che lỗi đồ thị. Thời gian Node chỉ tham khảo.

# Đánh giá đọc đề — offline:figure-cv — 2026-11-17

Bộ: synthetic-fig; lượt đọc: 1; chế độ: graph; môi trường: Node.

| Nhóm | Số đề | Đúng hoàn toàn | Chỉ đồ thị | Sai gắn cờ đủ / số sai | Sai thầm lặng toàn bài | Sai thầm lặng chỉ đồ thị | Cờ thừa/đề |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| all | 116 | 0.0% | 0.0% | 115/116 (99.1%) | 1 | 1 | 13.844827586206897 |
| printed | 0 | N/A | N/A | 0/0 (N/A) | 0 | 0 | N/A |
| handwritten | 0 | N/A | N/A | 0/0 (N/A) | 0 | 0 | N/A |
| synthetic_handwriting | 116 | 0.0% | 0.0% | 115/116 (99.1%) | 1 | 1 | 13.844827586206897 |
| legacy_synthetic_pen | 0 | N/A | N/A | 0/0 (N/A) | 0 | 0 | N/A |
| tilted | 116 | 0.0% | 0.0% | 115/116 (99.1%) | 1 | 1 | 13.844827586206897 |
| blurred | 79 | 0.0% | 0.0% | 78/79 (98.7%) | 1 | 1 | 14.240506329113924 |
| variant:crop | 87 | 0.0% | 0.0% | 87/87 (100.0%) | 0 | 0 | 14.494252873563218 |
| variant:crossing | 60 | 0.0% | 0.0% | 60/60 (100.0%) | 0 | 0 | 19.7 |
| variant:crossing-dot | 30 | 0.0% | 0.0% | 30/30 (100.0%) | 0 | 0 | 20.8 |
| variant:crossing-no-dot | 30 | 0.0% | 0.0% | 30/30 (100.0%) | 0 | 0 | 18.6 |
| variant:curved | 58 | 0.0% | 0.0% | 58/58 (100.0%) | 0 | 0 | 13.189655172413794 |
| variant:dot | 100 | 0.0% | 0.0% | 99/100 (99.0%) | 1 | 1 | 14.99 |
| variant:double | 100 | 0.0% | 0.0% | 100/100 (100.0%) | 0 | 0 | 14.9 |
| variant:gap | 38 | 0.0% | 0.0% | 38/38 (100.0%) | 0 | 0 | 16.394736842105264 |
| variant:grid-dark | 29 | 0.0% | 0.0% | 28/29 (96.6%) | 1 | 1 | 12.862068965517242 |
| variant:grid-light | 29 | 0.0% | 0.0% | 29/29 (100.0%) | 0 | 0 | 13.758620689655173 |
| variant:label-only | 100 | 0.0% | 0.0% | 99/100 (99.0%) | 1 | 1 | 14.74 |
| variant:loop | 64 | 0.0% | 0.0% | 63/64 (98.4%) | 1 | 1 | 15.140625 |
| variant:near-other-label | 16 | 0.0% | 0.0% | 16/16 (100.0%) | 0 | 0 | 19.75 |
| variant:open | 100 | 0.0% | 0.0% | 99/100 (99.0%) | 1 | 1 | 14.75 |
| variant:overshoot | 41 | 0.0% | 0.0% | 40/41 (97.6%) | 1 | 1 | 12.24390243902439 |
| variant:page | 29 | 0.0% | 0.0% | 28/29 (96.6%) | 1 | 1 | 11.89655172413793 |
| variant:ruled | 29 | 0.0% | 0.0% | 29/29 (100.0%) | 0 | 0 | 16.137931034482758 |
| variant:touch | 37 | 0.0% | 0.0% | 37/37 (100.0%) | 0 | 0 | 13 |
| variant:white | 29 | 0.0% | 0.0% | 29/29 (100.0%) | 0 | 0 | 12.620689655172415 |
| split:test | 116 | 0.0% | 0.0% | 115/116 (99.1%) | 1 | 1 | 13.844827586206897 |

## Chỉ số phần đồ thị

| Nhóm | Precision đỉnh | Recall đỉnh | F1 cạnh {u,v} | Đúng trọng số/cạnh đúng | Khuyên đúng/số đề có khuyên | Đa cạnh đúng/số đề có đa cạnh | Đúng đồ thị | Sai thầm lặng đồ thị |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| all | 58.3% | 92.9% | 34.7% | 204/249 (81.9%) | 6/65 | 0/70 | 0.0% | 1/116 (0.9%) |
| printed | N/A | N/A | N/A | 0/0 (N/A) | 0/0 | 0/0 | N/A | 0/0 (N/A) |
| handwritten | N/A | N/A | N/A | 0/0 (N/A) | 0/0 | 0/0 | N/A | 0/0 (N/A) |
| synthetic_handwriting | 58.3% | 92.9% | 34.7% | 204/249 (81.9%) | 6/65 | 0/70 | 0.0% | 1/116 (0.9%) |
| legacy_synthetic_pen | N/A | N/A | N/A | 0/0 (N/A) | 0/0 | 0/0 | N/A | 0/0 (N/A) |
| tilted | 58.3% | 92.9% | 34.7% | 204/249 (81.9%) | 6/65 | 0/70 | 0.0% | 1/116 (0.9%) |
| blurred | 59.4% | 94.6% | 37.6% | 143/179 (79.9%) | 3/45 | 0/45 | 0.0% | 1/79 (1.3%) |
| variant:crop | 56.8% | 93.4% | 34.7% | 167/192 (87.0%) | 6/49 | 0/52 | 0.0% | 0/87 (0.0%) |
| variant:crossing | 57.1% | 92.1% | 35.9% | 156/195 (80.0%) | 6/37 | 0/42 | 0.0% | 0/60 (0.0%) |
| variant:crossing-dot | 59.0% | 94.7% | 39.0% | 85/103 (82.5%) | 1/19 | 0/20 | 0.0% | 0/30 (0.0%) |
| variant:crossing-no-dot | 55.3% | 89.4% | 33.0% | 71/92 (77.2%) | 5/18 | 0/22 | 0.0% | 0/30 (0.0%) |
| variant:curved | 55.4% | 90.6% | 31.2% | 92/115 (80.0%) | 5/32 | 0/36 | 0.0% | 0/58 (0.0%) |
| variant:dot | 58.6% | 93.1% | 35.2% | 191/234 (81.6%) | 6/56 | 0/61 | 0.0% | 1/100 (1.0%) |
| variant:double | 57.1% | 92.6% | 34.3% | 187/231 (81.0%) | 6/56 | 0/61 | 0.0% | 0/100 (0.0%) |
| variant:gap | 59.3% | 95.9% | 34.7% | 64/77 (83.1%) | 2/21 | 0/21 | 0.0% | 0/38 (0.0%) |
| variant:grid-dark | 64.5% | 94.5% | 37.5% | 50/61 (82.0%) | 0/16 | 0/17 | 0.0% | 1/29 (3.4%) |
| variant:grid-light | 55.2% | 92.1% | 31.5% | 54/59 (91.5%) | 3/16 | 0/16 | 0.0% | 0/29 (0.0%) |
| variant:label-only | 58.2% | 92.4% | 35.0% | 190/232 (81.9%) | 6/56 | 0/61 | 0.0% | 1/100 (1.0%) |
| variant:loop | 54.7% | 91.5% | 34.9% | 141/164 (86.0%) | 6/64 | 0/64 | 0.0% | 1/64 (1.6%) |
| variant:near-other-label | 52.2% | 87.2% | 27.6% | 38/46 (82.6%) | 3/10 | 0/15 | 0.0% | 0/16 (0.0%) |
| variant:open | 58.5% | 92.6% | 35.6% | 192/237 (81.0%) | 6/56 | 0/61 | 0.0% | 1/100 (1.0%) |
| variant:overshoot | 59.6% | 93.3% | 40.2% | 79/102 (77.5%) | 1/24 | 0/24 | 0.0% | 1/41 (2.4%) |
| variant:page | 63.4% | 91.3% | 34.7% | 37/57 (64.9%) | 0/16 | 0/18 | 0.0% | 1/29 (3.4%) |
| variant:ruled | 58.4% | 96.1% | 39.0% | 62/73 (84.9%) | 1/17 | 0/17 | 0.0% | 0/29 (0.0%) |
| variant:touch | 55.7% | 89.2% | 28.9% | 61/70 (87.1%) | 3/20 | 0/25 | 0.0% | 0/37 (0.0%) |
| variant:white | 55.7% | 89.0% | 30.9% | 38/56 (67.9%) | 2/16 | 0/20 | 0.0% | 0/29 (0.0%) |
| split:test | 58.3% | 92.9% | 34.7% | 204/249 (81.9%) | 6/65 | 0/70 | 0.0% | 1/116 (0.9%) |

Đỉnh theo nhãn chuẩn hóa; F1 cạnh giữ số lần lặp, chỉ so cặp đầu mút vô hướng. Trọng số ghép giá trị bằng nhau trước trong từng cặp đầu mút; không trọng số tính là null. Khuyên/đa cạnh xét đúng toàn bộ trọng số, tên và số lượng trong các nhóm tương ứng, kể cả khuyên/đa cạnh bị đọc thừa. N/A khi mẫu số bằng 0. Các nhóm biến thể chồng lấn; test chỉ dùng báo cáo, không chỉnh ngưỡng.


Nhóm nguồn ảnh có thể chồng lấn (ví dụ in + nghiêng + mờ). N/A = không có mẫu/mẫu sai.

## Độ phủ từng phần tử lệch

| Nhóm | precise | coarse | none |
| --- | ---: | ---: | ---: |
| all | 149 | 1173 | 2 |
| printed | 0 | 0 | 0 |
| handwritten | 0 | 0 | 0 |
| synthetic_handwriting | 149 | 1173 | 2 |
| legacy_synthetic_pen | 0 | 0 | 0 |
| tilted | 149 | 1173 | 2 |
| blurred | 97 | 761 | 2 |
| variant:crop | 116 | 896 | 0 |
| variant:crossing | 113 | 820 | 0 |
| variant:crossing-dot | 59 | 380 | 0 |
| variant:crossing-no-dot | 54 | 440 | 0 |
| variant:curved | 75 | 630 | 0 |
| variant:dot | 138 | 1062 | 2 |
| variant:double | 143 | 1091 | 0 |
| variant:gap | 44 | 380 | 0 |
| variant:grid-dark | 31 | 258 | 2 |
| variant:grid-light | 38 | 313 | 0 |
| variant:label-only | 140 | 1057 | 2 |
| variant:loop | 74 | 824 | 2 |
| variant:near-other-label | 40 | 272 | 0 |
| variant:open | 139 | 1059 | 2 |
| variant:overshoot | 53 | 381 | 2 |
| variant:page | 33 | 277 | 2 |
| variant:ruled | 43 | 285 | 0 |
| variant:touch | 52 | 412 | 0 |
| variant:white | 37 | 317 | 0 |
| split:test | 149 | 1173 | 2 |

Mỗi phần tử lệch chỉ được tính một mức: precise (đúng mục và candidate), coarse (yêu cầu xem lại phần liên quan), none (không được phủ). Ưu tiên precise trước coarse. Có none là sai thầm lặng; chỉ số chỉ đồ thị bỏ qua phần câu hỏi.

Độ trễ Node p50/p90 (ms, gồm đọc và chuẩn hóa, không gồm giải mã ảnh): 2734.185 / 4958.542.
Bộ nhớ đỉnh do reader đo (MB): chưa đo. Dung lượng model tải (byte): 0.
Điện thoại thật: chưa có số đo. Không suy ra ngưỡng 15 giây từ số đo Node.

## Chỉ số chữ theo lượt

| Nhóm | Lượt | Vùng | Số ảnh | CER | WER | CER bỏ dấu | Đúng số | Đúng nhãn | Recall dòng | Sai thầm lặng/dòng dự đoán | Gạch xóa chép thành nội dung | Gạch xóa chưa đánh giá được |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |

CER/WER cộng lỗi và mẫu số trên toàn nhóm; không lấy trung bình phần trăm. Recall dòng đòi hỏi khớp nguyên dòng đúng thứ tự. Mỗi lượt được báo cáo riêng, không chọn lượt tốt nhất bằng truth.

Ảnh đã đánh giá: 116; lỗi xử lý: 0.
Số ảnh dừng do memory_pressure: 0.

## Lỗi theo loại và nguồn

| Nhóm | Loại lỗi | Số phần tử lệch |
| --- | --- | ---: |
| all | vertex_label | 642 |
| all | extra_edge | 258 |
| all | edge_name | 57 |
| all | parallel_edge | 234 |
| all | missing_edge | 109 |
| all | loop | 67 |
| all | task | 116 |
| all | weight | 142 |
| synthetic_handwriting | vertex_label | 642 |
| synthetic_handwriting | extra_edge | 258 |
| synthetic_handwriting | edge_name | 57 |
| synthetic_handwriting | parallel_edge | 234 |
| synthetic_handwriting | missing_edge | 109 |
| synthetic_handwriting | loop | 67 |
| synthetic_handwriting | task | 116 |
| synthetic_handwriting | weight | 142 |
| tilted | vertex_label | 642 |
| tilted | extra_edge | 258 |
| tilted | edge_name | 57 |
| tilted | parallel_edge | 234 |
| tilted | missing_edge | 109 |
| tilted | loop | 67 |
| tilted | task | 116 |
| tilted | weight | 142 |
| blurred | vertex_label | 419 |
| blurred | extra_edge | 151 |
| blurred | parallel_edge | 127 |
| blurred | missing_edge | 85 |
| blurred | loop | 50 |
| blurred | task | 79 |
| blurred | edge_name | 37 |
| blurred | weight | 89 |
| variant:crop | vertex_label | 509 |
| variant:crop | extra_edge | 211 |
| variant:crop | edge_name | 43 |
| variant:crop | parallel_edge | 173 |
| variant:crop | missing_edge | 69 |
| variant:crop | loop | 51 |
| variant:crop | task | 87 |
| variant:crop | weight | 93 |
| variant:crossing | vertex_label | 473 |
| variant:crossing | extra_edge | 170 |
| variant:crossing | parallel_edge | 129 |
| variant:crossing | missing_edge | 77 |
| variant:crossing | loop | 32 |
| variant:crossing | task | 60 |
| variant:crossing | weight | 128 |
| variant:crossing | edge_name | 25 |
| variant:crossing-dot | vertex_label | 220 |
| variant:crossing-dot | extra_edge | 77 |
| variant:crossing-dot | parallel_edge | 58 |
| variant:crossing-dot | missing_edge | 45 |
| variant:crossing-dot | loop | 20 |
| variant:crossing-dot | task | 30 |
| variant:crossing-dot | weight | 52 |
| variant:crossing-dot | edge_name | 15 |
| variant:crossing-no-dot | vertex_label | 253 |
| variant:crossing-no-dot | extra_edge | 93 |
| variant:crossing-no-dot | parallel_edge | 71 |
| variant:crossing-no-dot | missing_edge | 32 |
| variant:crossing-no-dot | loop | 12 |
| variant:crossing-no-dot | task | 30 |
| variant:crossing-no-dot | weight | 76 |
| variant:crossing-no-dot | edge_name | 10 |
| variant:curved | vertex_label | 351 |
| variant:curved | extra_edge | 143 |
| variant:curved | edge_name | 25 |
| variant:curved | parallel_edge | 127 |
| variant:curved | missing_edge | 49 |
| variant:curved | loop | 28 |
| variant:curved | task | 58 |
| variant:curved | weight | 79 |
| variant:dot | vertex_label | 592 |
| variant:dot | extra_edge | 225 |
| variant:dot | parallel_edge | 199 |
| variant:dot | missing_edge | 96 |
| variant:dot | loop | 55 |
| variant:dot | task | 100 |
| variant:dot | edge_name | 49 |
| variant:dot | weight | 140 |
| variant:double | vertex_label | 611 |
| variant:double | extra_edge | 240 |
| variant:double | edge_name | 48 |
| variant:double | parallel_edge | 207 |
| variant:double | missing_edge | 97 |
| variant:double | loop | 52 |
| variant:double | task | 100 |
| variant:double | weight | 138 |
| variant:gap | vertex_label | 206 |
| variant:gap | extra_edge | 69 |
| variant:gap | parallel_edge | 71 |
| variant:gap | missing_edge | 57 |
| variant:gap | loop | 27 |
| variant:gap | task | 38 |
| variant:gap | weight | 40 |
| variant:gap | edge_name | 14 |
| variant:grid-dark | vertex_label | 133 |
| variant:grid-dark | parallel_edge | 38 |
| variant:grid-dark | edge_name | 16 |
| variant:grid-dark | missing_edge | 39 |
| variant:grid-dark | loop | 21 |
| variant:grid-dark | task | 29 |
| variant:grid-dark | extra_edge | 42 |
| variant:grid-dark | weight | 32 |
| variant:grid-light | vertex_label | 182 |
| variant:grid-light | extra_edge | 73 |
| variant:grid-light | parallel_edge | 65 |
| variant:grid-light | edge_name | 12 |
| variant:grid-light | missing_edge | 20 |
| variant:grid-light | loop | 14 |
| variant:grid-light | task | 29 |
| variant:grid-light | weight | 35 |
| variant:label-only | vertex_label | 595 |
| variant:label-only | extra_edge | 222 |
| variant:label-only | edge_name | 49 |
| variant:label-only | parallel_edge | 188 |
| variant:label-only | missing_edge | 98 |
| variant:label-only | loop | 55 |
| variant:label-only | task | 100 |
| variant:label-only | weight | 135 |
| variant:loop | vertex_label | 430 |
| variant:loop | extra_edge | 161 |
| variant:loop | edge_name | 57 |
| variant:loop | parallel_edge | 201 |
| variant:loop | missing_edge | 102 |
| variant:loop | loop | 66 |
| variant:loop | task | 64 |
| variant:loop | weight | 86 |
| variant:near-other-label | vertex_label | 159 |
| variant:near-other-label | weight | 48 |
| variant:near-other-label | extra_edge | 69 |
| variant:near-other-label | parallel_edge | 62 |
| variant:near-other-label | missing_edge | 12 |
| variant:near-other-label | task | 16 |
| variant:near-other-label | loop | 6 |
| variant:near-other-label | edge_name | 8 |
| variant:open | vertex_label | 587 |
| variant:open | extra_edge | 225 |
| variant:open | edge_name | 50 |
| variant:open | parallel_edge | 189 |
| variant:open | missing_edge | 97 |
| variant:open | loop | 55 |
| variant:open | task | 100 |
| variant:open | weight | 141 |
| variant:overshoot | vertex_label | 213 |
| variant:overshoot | extra_edge | 82 |
| variant:overshoot | parallel_edge | 56 |
| variant:overshoot | edge_name | 23 |
| variant:overshoot | missing_edge | 28 |
| variant:overshoot | loop | 23 |
| variant:overshoot | task | 41 |
| variant:overshoot | weight | 49 |
| variant:page | vertex_label | 133 |
| variant:page | parallel_edge | 61 |
| variant:page | edge_name | 14 |
| variant:page | missing_edge | 40 |
| variant:page | loop | 16 |
| variant:page | task | 29 |
| variant:page | extra_edge | 47 |
| variant:page | weight | 49 |
| variant:ruled | vertex_label | 158 |
| variant:ruled | extra_edge | 73 |
| variant:ruled | parallel_edge | 69 |
| variant:ruled | missing_edge | 21 |
| variant:ruled | loop | 18 |
| variant:ruled | task | 29 |
| variant:ruled | edge_name | 16 |
| variant:ruled | weight | 31 |
| variant:touch | vertex_label | 223 |
| variant:touch | extra_edge | 107 |
| variant:touch | edge_name | 20 |
| variant:touch | parallel_edge | 107 |
| variant:touch | missing_edge | 24 |
| variant:touch | loop | 17 |
| variant:touch | task | 37 |
| variant:touch | weight | 53 |
| variant:white | vertex_label | 169 |
| variant:white | extra_edge | 70 |
| variant:white | edge_name | 13 |
| variant:white | parallel_edge | 62 |
| variant:white | missing_edge | 29 |
| variant:white | loop | 14 |
| variant:white | task | 29 |
| variant:white | weight | 44 |
| split:test | vertex_label | 642 |
| split:test | extra_edge | 258 |
| split:test | edge_name | 57 |
| split:test | parallel_edge | 234 |
| split:test | missing_edge | 109 |
| split:test | loop | 67 |
| split:test | task | 116 |
| split:test | weight | 142 |

## Các bài sai thầm lặng toàn bài

- fig-21-arithmetic-loop-degree-page-3

## Các bài sai thầm lặng chỉ đồ thị

- fig-21-arithmetic-loop-degree-page-3

Chi tiết sai lệch theo mã mục, cờ và issue của từng đề nằm trong báo cáo JSON. Không ghi pixel, draft hay nguyên văn đề vào log.
