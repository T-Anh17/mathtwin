# Đo bài làm — parser real

Pipeline Lô 3.4: chọn chữ bằng từ vựng, gradeWork và hỏi lại bằng chữ truth đã căn dòng; tính cả soát dòng SAI. OCR thừa trả skip, truth gạch trả struck; mảnh OCR tách được khôi phục chung một lần. Truth chưa hiểu vẫn để hỏi lại. Chưa đủ căn cứ trên bài thật.

Nguồn: synthetic-hw / engine.

| Nhóm | Bài | Hiểu hoàn toàn | Kết luận đúng / so được | Đúng lỗi đầu / bài SAI | Sai thầm lặng (i) | SAI hiểu sai (ii) | SAI đọc sai (iii) | Văn xuôi unchecked |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| elements | 4 | 0 | 0/0 | 0/2 | 0 | 0 | 0 | 0 |
| connectivity | 4 | 3 | 0/0 | 0/2 | 0 | 0 | 0 | 0 |
| euler | 4 | 0 | 0/0 | 0/2 | 0 | 0 | 0 | 4 |
| hamilton | 4 | 0 | 0/0 | 0/2 | 0 | 0 | 0 | 8 |
| shortest_path | 4 | 0 | 0/0 | 0/2 | 0 | 0 | 0 | 4 |
| tsp | 4 | 0 | 0/0 | 0/2 | 0 | 0 | 0 | 4 |
| postman | 4 | 0 | 0/0 | 0/2 | 0 | 0 | 0 | 2 |
| degree | 4 | 0 | 0/0 | 0/2 | 0 | 0 | 0 | 0 |
| statements | 8 | 0 | 0/0 | 0/4 | 0 | 0 | 0 | 8 |

Tổng: 40; hiểu hoàn toàn 7.5%; claim 25/128; đúng dòng 23/25; hỏi lại 40; không đủ căn cứ 0; bước từ dòng gạch 4; sai thầm lặng (i)/(ii)/(iii): 0/0/0; văn xuôi unchecked 30.

B/C dùng căn dòng OCR–truth trước đo, trả lời và chẩn đoán. readingMismatch xét chữ trên nhóm căn dòng chứa dòng lỗi được báo; OCR thừa không có truth là đọc khác. Fixture chữ giữ index nguồn chuẩn.

Quy tắc 6 (chỉ thống kê): (i) có/không unchecked 0/0; (ii) có/không unchecked trước dòng sai đầu tiên 0/0.

Sau hỏi lại: 20/20 kết luận đúng; lỗi đầu 10/20; còn hỏi lại 20; sai thầm lặng (i)/(ii)/(iii) 0/0/0; câu hỏi trung bình/tối đa 12.15/25.

ContentAsProse conf dòng thấp/cao: 2/0 → 0/16. Sau hỏi lại, sai thầm lặng có/không dòng đọc sai conf ≥ 0,85: 0/0; vi phạm giới hạn câu hỏi: 0.
