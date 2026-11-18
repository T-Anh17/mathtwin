# Đo bài làm — parser real

Pipeline Lô 3.4: chọn chữ bằng từ vựng, gradeWork và hỏi lại bằng chữ truth đã căn dòng; tính cả soát dòng SAI. OCR thừa trả skip, truth gạch trả struck; mảnh OCR tách được khôi phục chung một lần. Truth chưa hiểu vẫn để hỏi lại. Chưa đủ căn cứ trên bài thật.

Nguồn: work-text / truth.

| Nhóm | Bài | Hiểu hoàn toàn | Kết luận đúng / so được | Đúng lỗi đầu / bài SAI | Sai thầm lặng (i) | SAI hiểu sai (ii) | SAI đọc sai (iii) | Văn xuôi unchecked |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| test-student | 240 | 189 | 96/97 | 27/108 | 0 | 0 | 0 | 0 |
| test-notes | 240 | 191 | 96/98 | 27/108 | 0 | 0 | 0 | 0 |

Tổng: 480; hiểu hoàn toàn 79.16666666666666%; claim 672/864; đúng dòng 670/672; hỏi lại 285; không đủ căn cứ 96; bước từ dòng gạch 0; sai thầm lặng (i)/(ii)/(iii): 0/0/0; văn xuôi unchecked 0.

B/C dùng căn dòng OCR–truth trước đo, trả lời và chẩn đoán. readingMismatch xét chữ trên nhóm căn dòng chứa dòng lỗi được báo; OCR thừa không có truth là đọc khác. Fixture chữ giữ index nguồn chuẩn.

Quy tắc 6 (chỉ thống kê): (i) có/không unchecked 0/0; (ii) có/không unchecked trước dòng sai đầu tiên 0/0.

Sau hỏi lại: 464/472 kết luận đúng; lỗi đầu 215/216; còn hỏi lại 8; sai thầm lặng (i)/(ii)/(iii) 0/0/0; câu hỏi trung bình/tối đa 1.3333333333333333/6.

ContentAsProse conf dòng thấp/cao: 0/1 → 0/1. Sau hỏi lại, sai thầm lặng có/không dòng đọc sai conf ≥ 0,85: 0/0; vi phạm giới hạn câu hỏi: 0.
