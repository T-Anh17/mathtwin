# Đo bài làm — parser real

Parser văn xuôi Lô 3.2; chưa hỗ trợ Dijkstra, nn_step, postman_duplicate, bảng. Chấm trực tiếp bằng core.grade để đo; chưa có gradeWork, readingCheck hay nâng unchecked thành hỏi lại (Lô 3.4). Các chỉ số chấm là chẩn đoán, không phải pipeline an toàn hoàn chỉnh. Chưa đủ căn cứ trên bài thật.

Nguồn: synthetic-hw / truth.

| Nhóm | Bài | Hiểu hoàn toàn | Kết luận đúng / so được | Đúng lỗi đầu / bài SAI | Sai thầm lặng (i) | SAI hiểu sai (ii) | SAI đọc sai (iii) | Văn xuôi unchecked |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| elements | 4 | 4 | 4/4 | 2/2 | 0 | 0 | 0 | 0 |
| connectivity | 4 | 4 | 4/4 | 2/2 | 0 | 0 | 0 | 0 |
| euler | 4 | 4 | 4/4 | 2/2 | 0 | 0 | 0 | 0 |
| hamilton | 4 | 4 | 4/4 | 2/2 | 0 | 0 | 0 | 0 |
| shortest_path | 4 | 0 | 4/4 | 2/2 | 0 | 0 | 0 | 0 |
| tsp | 4 | 4 | 4/4 | 2/2 | 0 | 0 | 0 | 0 |
| postman | 4 | 0 | 2/4 | 0/2 | 2 | 0 | 0 | 0 |
| degree | 4 | 4 | 4/4 | 2/2 | 0 | 0 | 0 | 0 |
| statements | 8 | 8 | 8/8 | 4/4 | 0 | 0 | 0 | 0 |

Tổng: 40; hiểu hoàn toàn 80%; claim 80/128; đúng dòng 80/80; hỏi lại 0; không đủ căn cứ 0; bước từ dòng gạch 0; sai thầm lặng (i)/(ii)/(iii): 2/0/0; văn xuôi unchecked 0.

Thiếu bằng chứng chữ (readingMismatch = null) được xếp bảo thủ vào (ii).

Quy tắc 6 (chỉ thống kê): (i) có/không unchecked 2/0; (ii) có/không unchecked trước dòng sai đầu tiên 0/0.

- 14-postman-alternative-matching-dancing-straight: (i); dòng lỗi dự đoán [], truth [17]; unchecked [17].
- 14-postman-alternative-matching-patrick-perspective: (i); dòng lỗi dự đoán [], truth [17]; unchecked [17].
