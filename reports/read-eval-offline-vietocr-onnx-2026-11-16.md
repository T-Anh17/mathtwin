# Đánh giá đọc đề — offline:vietocr-onnx — 2026-11-16

Bộ: synthetic-hw; lượt đọc: 1; chế độ: lines; môi trường: Node.

| Nhóm | Số đề | Đúng hoàn toàn | Chỉ đồ thị | Sai gắn cờ đủ / số sai | Sai thầm lặng toàn bài | Sai thầm lặng chỉ đồ thị | Cờ thừa/đề |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| all | 0 | N/A | N/A | 0/0 (N/A) | 0 | 0 | N/A |
| printed | 0 | N/A | N/A | 0/0 (N/A) | 0 | 0 | N/A |
| handwritten | 0 | N/A | N/A | 0/0 (N/A) | 0 | 0 | N/A |
| synthetic_handwriting | 0 | N/A | N/A | 0/0 (N/A) | 0 | 0 | N/A |
| legacy_synthetic_pen | 0 | N/A | N/A | 0/0 (N/A) | 0 | 0 | N/A |
| tilted | 0 | N/A | N/A | 0/0 (N/A) | 0 | 0 | N/A |
| blurred | 0 | N/A | N/A | 0/0 (N/A) | 0 | 0 | N/A |

Nhóm nguồn ảnh có thể chồng lấn (ví dụ in + nghiêng + mờ). N/A = không có mẫu/mẫu sai.

## Độ phủ từng phần tử lệch

| Nhóm | precise | coarse | none |
| --- | ---: | ---: | ---: |
| all | 0 | 0 | 0 |
| printed | 0 | 0 | 0 |
| handwritten | 0 | 0 | 0 |
| synthetic_handwriting | 0 | 0 | 0 |
| legacy_synthetic_pen | 0 | 0 | 0 |
| tilted | 0 | 0 | 0 |
| blurred | 0 | 0 | 0 |

Mỗi phần tử lệch chỉ được tính một mức: precise (đúng mục và candidate), coarse (yêu cầu xem lại phần liên quan), none (không được phủ). Ưu tiên precise trước coarse. Có none là sai thầm lặng; chỉ số chỉ đồ thị bỏ qua phần câu hỏi.

Độ trễ Node p50/p90 (ms, gồm đọc và chuẩn hóa, không gồm giải mã ảnh): 1300.380 / 1613.996.
Bộ nhớ đỉnh do reader đo (MB): chưa đo. Dung lượng model tải (byte): 99388430.
Điện thoại thật: chưa có số đo. Không suy ra ngưỡng 15 giây từ số đo Node.

## Chỉ số chữ theo lượt

| Nhóm | Lượt | Vùng | Số ảnh | CER | WER | CER bỏ dấu | Đúng số | Đúng nhãn | Recall dòng | Sai thầm lặng/dòng dự đoán | Gạch xóa chép thành nội dung | Gạch xóa chưa đánh giá được |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| all | 1 | all | 40 | 27.3% | 59.0% | 23.8% | 61.6% | 44.4% | 19.1% | 49/577 (8.5%) | 0 | 0 |
| all | 1 | question | 40 | 14.6% | 45.0% | 10.8% | 95.0% | 65.9% | 4.3% | 1/116 (0.9%) | 0 | 0 |
| all | 1 | figure | 40 | 59.2% | 79.6% | 58.3% | 57.8% | 9.7% | 37.1% | 1/243 (0.4%) | 0 | 0 |
| all | 1 | table | 4 | 17.3% | 25.0% | 16.8% | 85.0% | 62.5% | 0.0% | 46/96 (47.9%) | 0 | 0 |
| all | 1 | solution | 40 | 43.8% | 73.9% | 40.0% | 29.2% | 56.3% | 0.0% | 1/122 (0.8%) | 0 | 0 |
| synthetic_handwriting | 1 | all | 40 | 27.3% | 59.0% | 23.8% | 61.6% | 44.4% | 19.1% | 49/577 (8.5%) | 0 | 0 |
| synthetic_handwriting | 1 | question | 40 | 14.6% | 45.0% | 10.8% | 95.0% | 65.9% | 4.3% | 1/116 (0.9%) | 0 | 0 |
| synthetic_handwriting | 1 | figure | 40 | 59.2% | 79.6% | 58.3% | 57.8% | 9.7% | 37.1% | 1/243 (0.4%) | 0 | 0 |
| synthetic_handwriting | 1 | table | 4 | 17.3% | 25.0% | 16.8% | 85.0% | 62.5% | 0.0% | 46/96 (47.9%) | 0 | 0 |
| synthetic_handwriting | 1 | solution | 40 | 43.8% | 73.9% | 40.0% | 29.2% | 56.3% | 0.0% | 1/122 (0.8%) | 0 | 0 |
| tilted | 1 | all | 20 | 18.2% | 50.6% | 15.2% | 64.8% | 46.1% | 20.6% | 26/277 (9.4%) | 0 | 0 |
| tilted | 1 | question | 20 | 12.4% | 41.9% | 9.1% | 90.0% | 68.2% | 5.2% | 1/58 (1.7%) | 0 | 0 |
| tilted | 1 | figure | 20 | 35.4% | 66.7% | 34.6% | 62.5% | 13.9% | 39.7% | 0/115 (0.0%) | 0 | 0 |
| tilted | 1 | table | 2 | 11.5% | 20.0% | 11.5% | 86.7% | 68.8% | 0.0% | 24/50 (48.0%) | 0 | 0 |
| tilted | 1 | solution | 20 | 23.2% | 57.9% | 20.0% | 38.9% | 58.3% | 0.0% | 1/54 (1.9%) | 0 | 0 |

CER/WER cộng lỗi và mẫu số trên toàn nhóm; không lấy trung bình phần trăm. Recall dòng đòi hỏi khớp nguyên dòng đúng thứ tự. Mỗi lượt được báo cáo riêng, không chọn lượt tốt nhất bằng truth.

## Giới hạn từ vựng và dòng bị cắt

Ký hiệu ngoài từ vựng: → × ∞ ≥ ≤ ≠.

| Nhóm | Dòng truncated | Dòng truth chứa ký hiệu ngoài từ vựng |
| --- | ---: | ---: |
| all | 3 | 24 |
| printed | N/A | N/A |
| handwritten | N/A | N/A |
| synthetic_handwriting | 3 | 24 |
| legacy_synthetic_pen | N/A | N/A |
| tilted | 0 | 12 |
| blurred | N/A | N/A |

Đếm mỗi dòng truth có hiệu lực một lần dù chứa nhiều ký hiệu thiếu. Truth giữ nguyên; CER/WER vẫn tính mọi dòng, kể cả dòng chứa ký hiệu thiếu và phần chữ truncated có conf = 0. Các bộ đếm này giúp phân biệt giới hạn từ vựng với lỗi đọc.

Ảnh đã đánh giá: 40; lỗi xử lý: 0.
Số ảnh dừng do memory_pressure: 0.

## Lỗi theo loại và nguồn

| Nhóm | Loại lỗi | Số phần tử lệch |
| --- | --- | ---: |
| all | Không có lỗi | 0 |

## Các bài sai thầm lặng toàn bài

Không có.

## Các bài sai thầm lặng chỉ đồ thị

Không có.

Chi tiết sai lệch theo mã mục, cờ và issue của từng đề nằm trong báo cáo JSON. Không ghi pixel, draft hay nguyên văn đề vào log.
