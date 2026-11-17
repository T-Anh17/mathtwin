# Lô 2.11 — D + glyph c

Ảnh tổng hợp, split test; tự tìm vùng hình. Không dùng truth để chọn vùng, đỉnh hay cạnh. Oracle chỉ trả chữ cho crop CV đề xuất.

Cấu trúc (nhãn + multiset {u,v}, bỏ trọng số/tên cạnh): 0/116; F1 cạnh 0.0068.

Bảng dưới chấm toàn bộ phần đồ thị, gồm trọng số/tên cạnh. D không đọc câu hỏi: missing_question là blocking, không được dùng cờ này để suy ra cấu trúc an toàn. Chỉ số sai thầm lặng phần đồ thị được bộ chấm tính riêng.

Thời gian Node chỉ tham khảo; không đo điện thoại.

# Đánh giá đọc đề — offline:figure-cv — 2026-11-17

Bộ: synthetic-fig; lượt đọc: 1; chế độ: graph; môi trường: Node.

| Nhóm | Số đề | Đúng hoàn toàn | Chỉ đồ thị | Sai gắn cờ đủ / số sai | Sai thầm lặng toàn bài | Sai thầm lặng chỉ đồ thị | Cờ thừa/đề |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| all | 116 | 0.0% | 0.0% | 115/116 (99.1%) | 1 | 1 | 6.362068965517241 |
| printed | 0 | N/A | N/A | 0/0 (N/A) | 0 | 0 | N/A |
| handwritten | 0 | N/A | N/A | 0/0 (N/A) | 0 | 0 | N/A |
| synthetic_handwriting | 116 | 0.0% | 0.0% | 115/116 (99.1%) | 1 | 1 | 6.362068965517241 |
| legacy_synthetic_pen | 0 | N/A | N/A | 0/0 (N/A) | 0 | 0 | N/A |
| tilted | 116 | 0.0% | 0.0% | 115/116 (99.1%) | 1 | 1 | 6.362068965517241 |
| blurred | 79 | 0.0% | 0.0% | 78/79 (98.7%) | 1 | 1 | 6.772151898734177 |
| variant:crop | 87 | 0.0% | 0.0% | 87/87 (100.0%) | 0 | 0 | 6.839080459770115 |
| variant:crossing | 60 | 0.0% | 0.0% | 60/60 (100.0%) | 0 | 0 | 9.316666666666666 |
| variant:crossing-dot | 30 | 0.0% | 0.0% | 30/30 (100.0%) | 0 | 0 | 10.066666666666666 |
| variant:crossing-no-dot | 30 | 0.0% | 0.0% | 30/30 (100.0%) | 0 | 0 | 8.566666666666666 |
| variant:curved | 58 | 0.0% | 0.0% | 58/58 (100.0%) | 0 | 0 | 5.793103448275862 |
| variant:dot | 100 | 0.0% | 0.0% | 99/100 (99.0%) | 1 | 1 | 6.9 |
| variant:double | 100 | 0.0% | 0.0% | 100/100 (100.0%) | 0 | 0 | 6.88 |
| variant:gap | 38 | 0.0% | 0.0% | 38/38 (100.0%) | 0 | 0 | 8.131578947368421 |
| variant:grid-dark | 29 | 0.0% | 0.0% | 28/29 (96.6%) | 1 | 1 | 5.344827586206897 |
| variant:grid-light | 29 | 0.0% | 0.0% | 29/29 (100.0%) | 0 | 0 | 5.724137931034483 |
| variant:label-only | 100 | 0.0% | 0.0% | 99/100 (99.0%) | 1 | 1 | 6.65 |
| variant:loop | 64 | 0.0% | 0.0% | 63/64 (98.4%) | 1 | 1 | 6.90625 |
| variant:near-other-label | 16 | 0.0% | 0.0% | 16/16 (100.0%) | 0 | 0 | 8.25 |
| variant:open | 100 | 0.0% | 0.0% | 99/100 (99.0%) | 1 | 1 | 6.84 |
| variant:overshoot | 41 | 0.0% | 0.0% | 40/41 (97.6%) | 1 | 1 | 5.512195121951219 |
| variant:page | 29 | 0.0% | 0.0% | 28/29 (96.6%) | 1 | 1 | 4.931034482758621 |
| variant:ruled | 29 | 0.0% | 0.0% | 29/29 (100.0%) | 0 | 0 | 8.517241379310345 |
| variant:touch | 37 | 0.0% | 0.0% | 37/37 (100.0%) | 0 | 0 | 5.486486486486487 |
| variant:white | 29 | 0.0% | 0.0% | 29/29 (100.0%) | 0 | 0 | 5.862068965517241 |
| split:test | 116 | 0.0% | 0.0% | 115/116 (99.1%) | 1 | 1 | 6.362068965517241 |

## Chỉ số phần đồ thị

| Nhóm | Precision đỉnh | Recall đỉnh | F1 cạnh {u,v} | Đúng trọng số/cạnh đúng | Khuyên đúng/số đề có khuyên | Đa cạnh đúng/số đề có đa cạnh | Đúng đồ thị | Sai thầm lặng đồ thị |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| all | 8.3% | 10.8% | 0.7% | 3/4 (75.0%) | 0/67 | 0/73 | 0.0% | 1/116 (0.9%) |
| printed | N/A | N/A | N/A | 0/0 (N/A) | 0/0 | 0/0 | N/A | 0/0 (N/A) |
| handwritten | N/A | N/A | N/A | 0/0 (N/A) | 0/0 | 0/0 | N/A | 0/0 (N/A) |
| synthetic_handwriting | 8.3% | 10.8% | 0.7% | 3/4 (75.0%) | 0/67 | 0/73 | 0.0% | 1/116 (0.9%) |
| legacy_synthetic_pen | N/A | N/A | N/A | 0/0 (N/A) | 0/0 | 0/0 | N/A | 0/0 (N/A) |
| tilted | 8.3% | 10.8% | 0.7% | 3/4 (75.0%) | 0/67 | 0/73 | 0.0% | 1/116 (0.9%) |
| blurred | 8.0% | 10.6% | 0.8% | 2/3 (66.7%) | 0/45 | 0/48 | 0.0% | 1/79 (1.3%) |
| variant:crop | 7.8% | 10.8% | 0.7% | 2/3 (66.7%) | 0/50 | 0/53 | 0.0% | 0/87 (0.0%) |
| variant:crossing | 8.0% | 10.6% | 0.7% | 2/3 (66.7%) | 0/39 | 0/44 | 0.0% | 0/60 (0.0%) |
| variant:crossing-dot | 11.7% | 14.7% | 0.9% | 2/2 (100.0%) | 0/21 | 0/22 | 0.0% | 0/30 (0.0%) |
| variant:crossing-no-dot | 4.7% | 6.5% | 0.4% | 0/1 (0.0%) | 0/18 | 0/22 | 0.0% | 0/30 (0.0%) |
| variant:curved | 3.6% | 5.1% | 0.3% | 0/1 (0.0%) | 0/32 | 0/37 | 0.0% | 0/58 (0.0%) |
| variant:dot | 9.0% | 11.7% | 0.7% | 3/4 (75.0%) | 0/58 | 0/64 | 0.0% | 1/100 (1.0%) |
| variant:double | 7.2% | 9.7% | 0.5% | 2/3 (66.7%) | 0/58 | 0/64 | 0.0% | 0/100 (0.0%) |
| variant:gap | 10.7% | 14.7% | 1.6% | 2/3 (66.7%) | 0/21 | 0/22 | 0.0% | 0/38 (0.0%) |
| variant:grid-dark | 12.7% | 13.4% | 0.7% | 1/1 (100.0%) | 0/18 | 0/18 | 0.0% | 1/29 (3.4%) |
| variant:grid-light | 2.6% | 3.9% | 0.0% | 0/0 (N/A) | 0/16 | 0/17 | 0.0% | 0/29 (0.0%) |
| variant:label-only | 7.8% | 10.2% | 0.7% | 3/4 (75.0%) | 0/58 | 0/64 | 0.0% | 1/100 (1.0%) |
| variant:loop | 6.3% | 8.5% | 0.5% | 1/2 (50.0%) | 0/64 | 0/64 | 0.0% | 1/64 (1.6%) |
| variant:near-other-label | 7.6% | 9.6% | 0.0% | 0/0 (N/A) | 0/12 | 0/15 | 0.0% | 0/16 (0.0%) |
| variant:open | 8.9% | 11.5% | 0.7% | 3/4 (75.0%) | 0/58 | 0/63 | 0.0% | 1/100 (1.0%) |
| variant:overshoot | 5.3% | 6.7% | 0.0% | 0/0 (N/A) | 0/24 | 0/26 | 0.0% | 1/41 (2.4%) |
| variant:page | 10.2% | 11.0% | 0.7% | 1/1 (100.0%) | 0/17 | 0/20 | 0.0% | 1/29 (3.4%) |
| variant:ruled | 14.5% | 19.7% | 1.3% | 2/2 (100.0%) | 0/17 | 0/18 | 0.0% | 0/29 (0.0%) |
| variant:touch | 8.8% | 11.4% | 0.5% | 1/1 (100.0%) | 0/22 | 0/25 | 0.0% | 0/37 (0.0%) |
| variant:white | 4.7% | 6.3% | 0.7% | 0/1 (0.0%) | 0/16 | 0/20 | 0.0% | 0/29 (0.0%) |
| split:test | 8.3% | 10.8% | 0.7% | 3/4 (75.0%) | 0/67 | 0/73 | 0.0% | 1/116 (0.9%) |

Đỉnh theo nhãn chuẩn hóa; F1 cạnh giữ số lần lặp, chỉ so cặp đầu mút vô hướng. Trọng số ghép giá trị bằng nhau trước trong từng cặp đầu mút; không trọng số tính là null. Khuyên/đa cạnh xét đúng toàn bộ trọng số, tên và số lượng trong các nhóm tương ứng, kể cả khuyên/đa cạnh bị đọc thừa. N/A khi mẫu số bằng 0. Các nhóm biến thể chồng lấn; test chỉ dùng báo cáo, không chỉnh ngưỡng.


Nhóm nguồn ảnh có thể chồng lấn (ví dụ in + nghiêng + mờ). N/A = không có mẫu/mẫu sai.

## Độ phủ từng phần tử lệch

| Nhóm | precise | coarse | none |
| --- | ---: | ---: | ---: |
| all | 176 | 1705 | 5 |
| printed | 0 | 0 | 0 |
| handwritten | 0 | 0 | 0 |
| synthetic_handwriting | 176 | 1705 | 5 |
| legacy_synthetic_pen | 0 | 0 | 0 |
| tilted | 176 | 1705 | 5 |
| blurred | 136 | 1146 | 5 |
| variant:crop | 139 | 1323 | 0 |
| variant:crossing | 147 | 1213 | 0 |
| variant:crossing-dot | 85 | 574 | 0 |
| variant:crossing-no-dot | 62 | 639 | 0 |
| variant:curved | 76 | 912 | 0 |
| variant:dot | 170 | 1546 | 5 |
| variant:double | 174 | 1592 | 0 |
| variant:gap | 84 | 524 | 0 |
| variant:grid-dark | 39 | 376 | 5 |
| variant:grid-light | 38 | 467 | 0 |
| variant:label-only | 161 | 1556 | 5 |
| variant:loop | 109 | 1123 | 5 |
| variant:near-other-label | 36 | 348 | 0 |
| variant:open | 166 | 1548 | 5 |
| variant:overshoot | 52 | 622 | 5 |
| variant:page | 37 | 382 | 5 |
| variant:ruled | 61 | 417 | 0 |
| variant:touch | 40 | 559 | 0 |
| variant:white | 38 | 445 | 0 |
| split:test | 176 | 1705 | 5 |

Mỗi phần tử lệch chỉ được tính một mức: precise (đúng mục và candidate), coarse (yêu cầu xem lại phần liên quan), none (không được phủ). Ưu tiên precise trước coarse. Có none là sai thầm lặng; chỉ số chỉ đồ thị bỏ qua phần câu hỏi.

Độ trễ Node p50/p90 (ms, gồm đọc và chuẩn hóa, không gồm giải mã ảnh): 2586.121 / 4676.961.
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
| all | vertex_label | 701 |
| all | extra_edge | 457 |
| all | missing_edge | 571 |
| all | loop | 93 |
| all | parallel_edge | 252 |
| all | task | 116 |
| all | edge_name | 8 |
| all | weight | 33 |
| synthetic_handwriting | vertex_label | 701 |
| synthetic_handwriting | extra_edge | 457 |
| synthetic_handwriting | missing_edge | 571 |
| synthetic_handwriting | loop | 93 |
| synthetic_handwriting | parallel_edge | 252 |
| synthetic_handwriting | task | 116 |
| synthetic_handwriting | edge_name | 8 |
| synthetic_handwriting | weight | 33 |
| tilted | vertex_label | 701 |
| tilted | extra_edge | 457 |
| tilted | missing_edge | 571 |
| tilted | loop | 93 |
| tilted | parallel_edge | 252 |
| tilted | task | 116 |
| tilted | edge_name | 8 |
| tilted | weight | 33 |
| blurred | vertex_label | 488 |
| blurred | extra_edge | 300 |
| blurred | parallel_edge | 162 |
| blurred | loop | 66 |
| blurred | missing_edge | 393 |
| blurred | task | 79 |
| blurred | edge_name | 5 |
| blurred | weight | 22 |
| variant:crop | vertex_label | 551 |
| variant:crop | extra_edge | 366 |
| variant:crop | missing_edge | 425 |
| variant:crop | loop | 72 |
| variant:crop | parallel_edge | 191 |
| variant:crop | task | 87 |
| variant:crop | edge_name | 4 |
| variant:crop | weight | 29 |
| variant:crossing | vertex_label | 471 |
| variant:crossing | extra_edge | 354 |
| variant:crossing | parallel_edge | 175 |
| variant:crossing | missing_edge | 446 |
| variant:crossing | loop | 57 |
| variant:crossing | task | 60 |
| variant:crossing | weight | 29 |
| variant:crossing-dot | vertex_label | 234 |
| variant:crossing-dot | extra_edge | 165 |
| variant:crossing-dot | parallel_edge | 88 |
| variant:crossing-dot | missing_edge | 209 |
| variant:crossing-dot | loop | 32 |
| variant:crossing-dot | task | 30 |
| variant:crossing-dot | weight | 21 |
| variant:crossing-no-dot | vertex_label | 237 |
| variant:crossing-no-dot | extra_edge | 189 |
| variant:crossing-no-dot | parallel_edge | 87 |
| variant:crossing-no-dot | missing_edge | 237 |
| variant:crossing-no-dot | loop | 25 |
| variant:crossing-no-dot | task | 30 |
| variant:crossing-no-dot | weight | 8 |
| variant:curved | vertex_label | 369 |
| variant:curved | extra_edge | 247 |
| variant:curved | missing_edge | 305 |
| variant:curved | loop | 42 |
| variant:curved | parallel_edge | 124 |
| variant:curved | task | 58 |
| variant:curved | weight | 8 |
| variant:curved | edge_name | 1 |
| variant:dot | vertex_label | 632 |
| variant:dot | extra_edge | 418 |
| variant:dot | parallel_edge | 223 |
| variant:dot | loop | 81 |
| variant:dot | missing_edge | 530 |
| variant:dot | task | 100 |
| variant:dot | edge_name | 8 |
| variant:dot | weight | 33 |
| variant:double | vertex_label | 652 |
| variant:double | extra_edge | 438 |
| variant:double | missing_edge | 539 |
| variant:double | loop | 81 |
| variant:double | parallel_edge | 224 |
| variant:double | task | 100 |
| variant:double | edge_name | 5 |
| variant:double | weight | 32 |
| variant:gap | vertex_label | 255 |
| variant:gap | extra_edge | 119 |
| variant:gap | parallel_edge | 72 |
| variant:gap | loop | 33 |
| variant:gap | missing_edge | 176 |
| variant:gap | task | 38 |
| variant:gap | weight | 20 |
| variant:grid-dark | vertex_label | 148 |
| variant:grid-dark | extra_edge | 91 |
| variant:grid-dark | parallel_edge | 57 |
| variant:grid-dark | edge_name | 3 |
| variant:grid-dark | missing_edge | 143 |
| variant:grid-dark | loop | 24 |
| variant:grid-dark | task | 29 |
| variant:grid-dark | weight | 6 |
| variant:grid-light | vertex_label | 193 |
| variant:grid-light | extra_edge | 126 |
| variant:grid-light | parallel_edge | 54 |
| variant:grid-light | missing_edge | 155 |
| variant:grid-light | loop | 21 |
| variant:grid-light | task | 29 |
| variant:grid-light | edge_name | 1 |
| variant:grid-light | weight | 1 |
| variant:label-only | vertex_label | 638 |
| variant:label-only | extra_edge | 415 |
| variant:label-only | missing_edge | 535 |
| variant:label-only | loop | 78 |
| variant:label-only | parallel_edge | 220 |
| variant:label-only | task | 100 |
| variant:label-only | edge_name | 4 |
| variant:label-only | weight | 30 |
| variant:loop | vertex_label | 448 |
| variant:loop | extra_edge | 300 |
| variant:loop | missing_edge | 408 |
| variant:loop | loop | 90 |
| variant:loop | parallel_edge | 224 |
| variant:loop | task | 64 |
| variant:loop | edge_name | 8 |
| variant:loop | weight | 9 |
| variant:near-other-label | vertex_label | 125 |
| variant:near-other-label | extra_edge | 108 |
| variant:near-other-label | parallel_edge | 65 |
| variant:near-other-label | missing_edge | 126 |
| variant:near-other-label | task | 16 |
| variant:near-other-label | weight | 9 |
| variant:near-other-label | loop | 15 |
| variant:open | vertex_label | 624 |
| variant:open | extra_edge | 422 |
| variant:open | missing_edge | 533 |
| variant:open | loop | 80 |
| variant:open | parallel_edge | 224 |
| variant:open | task | 100 |
| variant:open | edge_name | 7 |
| variant:open | weight | 33 |
| variant:overshoot | vertex_label | 233 |
| variant:overshoot | extra_edge | 181 |
| variant:overshoot | parallel_edge | 90 |
| variant:overshoot | missing_edge | 217 |
| variant:overshoot | loop | 33 |
| variant:overshoot | task | 41 |
| variant:overshoot | edge_name | 5 |
| variant:overshoot | weight | 2 |
| variant:page | vertex_label | 150 |
| variant:page | extra_edge | 91 |
| variant:page | parallel_edge | 61 |
| variant:page | edge_name | 4 |
| variant:page | missing_edge | 146 |
| variant:page | loop | 21 |
| variant:page | task | 29 |
| variant:page | weight | 4 |
| variant:ruled | vertex_label | 184 |
| variant:ruled | extra_edge | 119 |
| variant:ruled | parallel_edge | 71 |
| variant:ruled | loop | 27 |
| variant:ruled | missing_edge | 123 |
| variant:ruled | task | 29 |
| variant:ruled | edge_name | 4 |
| variant:ruled | weight | 19 |
| variant:touch | vertex_label | 213 |
| variant:touch | extra_edge | 157 |
| variant:touch | missing_edge | 178 |
| variant:touch | loop | 27 |
| variant:touch | parallel_edge | 90 |
| variant:touch | task | 37 |
| variant:touch | edge_name | 3 |
| variant:touch | weight | 11 |
| variant:white | vertex_label | 176 |
| variant:white | extra_edge | 121 |
| variant:white | missing_edge | 150 |
| variant:white | loop | 21 |
| variant:white | parallel_edge | 70 |
| variant:white | task | 29 |
| variant:white | weight | 7 |
| split:test | vertex_label | 701 |
| split:test | extra_edge | 457 |
| split:test | missing_edge | 571 |
| split:test | loop | 93 |
| split:test | parallel_edge | 252 |
| split:test | task | 116 |
| split:test | edge_name | 8 |
| split:test | weight | 33 |

## Các bài sai thầm lặng toàn bài

- fig-21-arithmetic-loop-degree-page-3

## Các bài sai thầm lặng chỉ đồ thị

- fig-21-arithmetic-loop-degree-page-3

Chi tiết sai lệch theo mã mục, cờ và issue của từng đề nằm trong báo cáo JSON. Không ghi pixel, draft hay nguyên văn đề vào log.
