# Kiểm bộ đo bài làm — parser oracle

Parser oracle trả claims truth, bỏ qua chữ quan sát khi tạo claim. 100% chỉ kiểm bộ đo. Không phải độ chính xác đọc/hiểu, không mô phỏng hỏi lại (Lô 3.4). Chưa đủ căn cứ trên bài thật.

Nguồn: work-text / truth.

| Nhóm | Bài | Hiểu hoàn toàn | Kết luận đúng / so được | Đúng lỗi đầu / bài SAI | Sai thầm lặng (i) | SAI hiểu sai (ii) | SAI đọc sai (iii) | Văn xuôi unchecked |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| dev-direct | 240 | 240 | 228/228 | 108/108 | 0 | 0 | 0 | 0 |
| dev-symbolic | 240 | 240 | 228/228 | 108/108 | 0 | 0 | 0 | 0 |
| dev-table | 240 | 240 | 228/228 | 108/108 | 0 | 0 | 0 | 0 |

Tổng: 720; hiểu hoàn toàn 100%; claim 1284/1284; đúng dòng 1284/1284; hỏi lại 36; không đủ căn cứ 144; bước từ dòng gạch 0; sai thầm lặng (i)/(ii)/(iii): 0/0/0; văn xuôi unchecked 0.

Thiếu bằng chứng chữ (readingMismatch = null) được xếp bảo thủ vào (ii).
