# Đo bài làm — parser real

Pipeline Lô 3.4: chọn chữ bằng từ vựng, gradeWork và hỏi lại bằng chữ truth đã căn dòng; tính cả soát dòng SAI. OCR thừa trả skip, truth gạch trả struck; mảnh OCR tách được khôi phục chung một lần. Truth chưa hiểu vẫn để hỏi lại. Chưa đủ căn cứ trên bài thật.

Nguồn: synthetic-hw / device.

| Nhóm | Bài | Hiểu hoàn toàn | Kết luận đúng / so được | Đúng lỗi đầu / bài SAI | Sai thầm lặng (i) | SAI hiểu sai (ii) | SAI đọc sai (iii) | Văn xuôi unchecked |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| elements | 4 | 2 | 0/0 | 0/2 | 0 | 0 | 0 | 0 |
| connectivity | 4 | 2 | 0/0 | 0/2 | 0 | 0 | 0 | 0 |
| euler | 4 | 1 | 0/0 | 0/2 | 0 | 0 | 0 | 3 |
| hamilton | 4 | 2 | 0/0 | 0/2 | 0 | 0 | 0 | 6 |
| shortest_path | 4 | 0 | 0/3 | 0/2 | 0 | 0 | 0 | 1 |
| tsp | 4 | 1 | 0/0 | 0/2 | 0 | 0 | 0 | 4 |
| postman | 4 | 0 | 0/0 | 0/2 | 0 | 0 | 0 | 3 |
| degree | 4 | 1 | 0/1 | 0/2 | 0 | 0 | 1 | 0 |
| statements | 8 | 2 | 0/1 | 0/4 | 0 | 0 | 0 | 6 |

Tổng: 40; hiểu hoàn toàn 27.500000000000004%; claim 55/128; đúng dòng 54/55; hỏi lại 35; không đủ căn cứ 4; bước từ dòng gạch 7; sai thầm lặng (i)/(ii)/(iii): 0/0/1; văn xuôi unchecked 23.

B/C dùng căn dòng OCR–truth trước đo, trả lời và chẩn đoán. readingMismatch xét chữ trên nhóm căn dòng chứa dòng lỗi được báo; OCR thừa không có truth là đọc khác. Fixture chữ giữ index nguồn chuẩn.

Quy tắc 6 (chỉ thống kê): (i) có/không unchecked 0/0; (ii) có/không unchecked trước dòng sai đầu tiên 0/0.

Sau hỏi lại: 25/29 kết luận đúng; lỗi đầu 13/20; còn hỏi lại 11; sai thầm lặng (i)/(ii)/(iii) 0/0/0; câu hỏi trung bình/tối đa 4.525/11.

ContentAsProse conf dòng thấp/cao: 0/2 → 0/2. Sau hỏi lại, sai thầm lặng có/không dòng đọc sai conf ≥ 0,85: 0/0; vi phạm giới hạn câu hỏi: 0.

- 18-short-answer-degree-patrick-straight: (iii); dòng lỗi dự đoán [3], truth []; unchecked [].
