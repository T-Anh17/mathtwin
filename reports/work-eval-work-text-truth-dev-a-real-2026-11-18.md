# Đo bài làm — parser real

Parser Lô 3.3: văn xuôi, Dijkstra, nn_step, postman_duplicate, bảng và nhiều trang. Chấm trực tiếp bằng core.grade để đo; chưa có gradeWork, readingCheck hay nâng unchecked thành hỏi lại (Lô 3.4). Các chỉ số chấm là chẩn đoán, không phải pipeline an toàn hoàn chỉnh. Chưa đủ căn cứ trên bài thật.

Nguồn: work-text / truth.

| Nhóm | Bài | Hiểu hoàn toàn | Kết luận đúng / so được | Đúng lỗi đầu / bài SAI | Sai thầm lặng (i) | SAI hiểu sai (ii) | SAI đọc sai (iii) | Văn xuôi unchecked |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| dev-direct | 60 | 60 | 58/59 | 27/27 | 0 | 0 | 0 | 0 |
| dev-symbolic | 60 | 60 | 58/59 | 27/27 | 0 | 0 | 0 | 0 |
| dev-table | 60 | 60 | 58/59 | 27/27 | 0 | 0 | 0 | 0 |
| dev-paraphrase | 60 | 60 | 58/59 | 27/27 | 0 | 0 | 0 | 0 |
| dev-paraphrase-0001 | 60 | 60 | 58/59 | 27/27 | 0 | 0 | 0 | 0 |
| dev-paraphrase-0010 | 60 | 60 | 58/59 | 27/27 | 0 | 0 | 0 | 0 |
| dev-paraphrase-0011 | 60 | 60 | 58/59 | 27/27 | 0 | 0 | 0 | 0 |
| dev-paraphrase-0100 | 60 | 60 | 58/59 | 27/27 | 0 | 0 | 0 | 0 |
| dev-paraphrase-0101 | 60 | 60 | 58/59 | 27/27 | 0 | 0 | 0 | 0 |
| dev-paraphrase-0110 | 60 | 60 | 58/59 | 27/27 | 0 | 0 | 0 | 0 |
| dev-paraphrase-0111 | 60 | 60 | 58/59 | 27/27 | 0 | 0 | 0 | 0 |
| dev-paraphrase-1000 | 60 | 60 | 58/59 | 27/27 | 0 | 0 | 0 | 0 |
| dev-paraphrase-1001 | 60 | 60 | 58/59 | 27/27 | 0 | 0 | 0 | 0 |
| dev-paraphrase-1010 | 60 | 60 | 58/59 | 27/27 | 0 | 0 | 0 | 0 |
| dev-paraphrase-1011 | 60 | 60 | 58/59 | 27/27 | 0 | 0 | 0 | 0 |
| dev-paraphrase-1100 | 60 | 60 | 58/59 | 27/27 | 0 | 0 | 0 | 0 |
| dev-paraphrase-1101 | 60 | 60 | 58/59 | 27/27 | 0 | 0 | 0 | 0 |
| dev-paraphrase-1110 | 60 | 60 | 58/59 | 27/27 | 0 | 0 | 0 | 0 |
| dev-paraphrase-1111 | 60 | 60 | 58/59 | 27/27 | 0 | 0 | 0 | 0 |
| dev-paraphrase-open-00 | 60 | 60 | 58/59 | 27/27 | 0 | 0 | 0 | 0 |
| dev-paraphrase-open-01 | 60 | 60 | 58/59 | 27/27 | 0 | 0 | 0 | 0 |
| dev-paraphrase-open-10 | 60 | 60 | 58/59 | 27/27 | 0 | 0 | 0 | 0 |
| dev-paraphrase-open-11 | 60 | 60 | 58/59 | 27/27 | 0 | 0 | 0 | 0 |
| dev-paraphrase-select | 60 | 60 | 58/59 | 27/27 | 0 | 0 | 0 | 0 |
| dev-paraphrase-topic | 60 | 60 | 58/59 | 27/27 | 0 | 0 | 0 | 0 |
| dev-paraphrase-final | 60 | 60 | 58/59 | 27/27 | 0 | 0 | 0 | 0 |
| dev-paraphrase-label | 60 | 60 | 58/59 | 27/27 | 0 | 0 | 0 | 0 |

Tổng: 1620; hiểu hoàn toàn 100%; claim 2916/2916; đúng dòng 2916/2916; hỏi lại 27; không đủ căn cứ 324; bước từ dòng gạch 0; sai thầm lặng (i)/(ii)/(iii): 0/0/0; văn xuôi unchecked 0.

Thiếu bằng chứng chữ (readingMismatch = null) được xếp bảo thủ vào (ii).

Quy tắc 6 (chỉ thống kê): (i) có/không unchecked 0/0; (ii) có/không unchecked trước dòng sai đầu tiên 0/0.
