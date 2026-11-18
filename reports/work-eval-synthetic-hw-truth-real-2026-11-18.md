# Đo bài làm — parser real

Pipeline Lô 3.4: chọn chữ bằng từ vựng, gradeWork và hỏi lại bằng chữ truth đã căn dòng; tính cả soát dòng SAI. OCR thừa trả skip, truth gạch trả struck; mảnh OCR tách được khôi phục chung một lần. Truth chưa hiểu vẫn để hỏi lại. Chưa đủ căn cứ trên bài thật.

Nguồn: synthetic-hw / truth.

| Nhóm | Bài | Hiểu hoàn toàn | Kết luận đúng / so được | Đúng lỗi đầu / bài SAI | Sai thầm lặng (i) | SAI hiểu sai (ii) | SAI đọc sai (iii) | Văn xuôi unchecked |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| elements | 4 | 4 | 4/4 | 2/2 | 0 | 0 | 0 | 0 |
| connectivity | 4 | 4 | 4/4 | 2/2 | 0 | 0 | 0 | 0 |
| euler | 4 | 4 | 4/4 | 2/2 | 0 | 0 | 0 | 0 |
| hamilton | 4 | 4 | 4/4 | 2/2 | 0 | 0 | 0 | 0 |
| shortest_path | 4 | 4 | 4/4 | 2/2 | 0 | 0 | 0 | 2 |
| tsp | 4 | 4 | 4/4 | 2/2 | 0 | 0 | 0 | 0 |
| postman | 4 | 4 | 4/4 | 2/2 | 0 | 0 | 0 | 0 |
| degree | 4 | 4 | 4/4 | 2/2 | 0 | 0 | 0 | 0 |
| statements | 8 | 8 | 8/8 | 4/4 | 0 | 0 | 0 | 0 |

Tổng: 40; hiểu hoàn toàn 100%; claim 128/128; đúng dòng 128/128; hỏi lại 0; không đủ căn cứ 0; bước từ dòng gạch 0; sai thầm lặng (i)/(ii)/(iii): 0/0/0; văn xuôi unchecked 2.

B/C dùng căn dòng OCR–truth trước đo, trả lời và chẩn đoán. readingMismatch xét chữ trên nhóm căn dòng chứa dòng lỗi được báo; OCR thừa không có truth là đọc khác. Fixture chữ giữ index nguồn chuẩn.

Quy tắc 6 (chỉ thống kê): (i) có/không unchecked 0/0; (ii) có/không unchecked trước dòng sai đầu tiên 0/0.

Sau hỏi lại: 40/40 kết luận đúng; lỗi đầu 20/20; còn hỏi lại 0; sai thầm lặng (i)/(ii)/(iii) 0/0/0; câu hỏi trung bình/tối đa 0.5/1.

ContentAsProse conf dòng thấp/cao: 0/0 → 0/0. Sau hỏi lại, sai thầm lặng có/không dòng đọc sai conf ≥ 0,85: 0/0; vi phạm giới hạn câu hỏi: 0.
