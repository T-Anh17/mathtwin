# Đo bài làm — parser real

Pipeline Lô 3.4: chọn chữ bằng từ vựng, gradeWork và hỏi lại bằng chữ truth đã căn dòng; tính cả soát dòng SAI. OCR thừa trả skip, truth gạch trả struck; mảnh OCR tách được khôi phục chung một lần. Truth chưa hiểu vẫn để hỏi lại. Chưa đủ căn cứ trên bài thật.

Nguồn: work-text-tables / truth.

| Nhóm | Bài | Hiểu hoàn toàn | Kết luận đúng / so được | Đúng lỗi đầu / bài SAI | Sai thầm lặng (i) | SAI hiểu sai (ii) | SAI đọc sai (iii) | Văn xuôi unchecked |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| test-bracket | 460 | 330 | 159/159 | 105/304 | 0 | 0 | 0 | 0 |
| test-parenthesis | 460 | 333 | 230/230 | 152/304 | 0 | 0 | 0 | 0 |

Tổng: 920; hiểu hoàn toàn 72.06521739130434%; claim 9042/12192; đúng dòng 9042/9042; hỏi lại 531; không đủ căn cứ 0; bước từ dòng gạch 0; sai thầm lặng (i)/(ii)/(iii): 0/0/0; văn xuôi unchecked 0.

B/C dùng căn dòng OCR–truth trước đo, trả lời và chẩn đoán. readingMismatch xét chữ trên nhóm căn dòng chứa dòng lỗi được báo; OCR thừa không có truth là đọc khác. Fixture chữ giữ index nguồn chuẩn.

Quy tắc 6 (chỉ thống kê): (i) có/không unchecked 0/0; (ii) có/không unchecked trước dòng sai đầu tiên 0/0.

Sau hỏi lại: 920/920 kết luận đúng; lỗi đầu 608/608; còn hỏi lại 0; sai thầm lặng (i)/(ii)/(iii) 0/0/0; câu hỏi trung bình/tối đa 2.3880434782608697/9.

ContentAsProse conf dòng thấp/cao: 0/0 → 0/0. Sau hỏi lại, sai thầm lặng có/không dòng đọc sai conf ≥ 0,85: 0/0; vi phạm giới hạn câu hỏi: 0.
