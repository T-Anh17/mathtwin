# Đo bài làm — parser real

Parser văn xuôi Lô 3.2; chưa hỗ trợ Dijkstra, nn_step, postman_duplicate, bảng. Chấm trực tiếp bằng core.grade để đo; chưa có gradeWork, readingCheck hay nâng unchecked thành hỏi lại (Lô 3.4). Các chỉ số chấm là chẩn đoán, không phải pipeline an toàn hoàn chỉnh. Chưa đủ căn cứ trên bài thật.

Nguồn: work-text / truth.

| Nhóm | Bài | Hiểu hoàn toàn | Kết luận đúng / so được | Đúng lỗi đầu / bài SAI | Sai thầm lặng (i) | SAI hiểu sai (ii) | SAI đọc sai (iii) | Văn xuôi unchecked |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| dev-direct | 60 | 44 | 34/47 | 4/27 | 1 | 0 | 0 | 0 |
| dev-symbolic | 60 | 44 | 33/47 | 3/27 | 1 | 0 | 0 | 0 |
| dev-table | 60 | 44 | 31/44 | 1/27 | 1 | 0 | 0 | 0 |
| dev-paraphrase | 60 | 44 | 31/44 | 1/27 | 1 | 0 | 0 | 0 |
| dev-paraphrase-0001 | 60 | 44 | 32/45 | 2/27 | 1 | 0 | 0 | 0 |
| dev-paraphrase-0010 | 60 | 44 | 30/43 | 0/27 | 1 | 0 | 0 | 0 |
| dev-paraphrase-0011 | 60 | 44 | 32/45 | 2/27 | 1 | 0 | 0 | 0 |
| dev-paraphrase-0100 | 60 | 44 | 31/44 | 1/27 | 1 | 0 | 0 | 0 |
| dev-paraphrase-0101 | 60 | 44 | 31/44 | 1/27 | 1 | 0 | 0 | 0 |
| dev-paraphrase-0110 | 60 | 44 | 33/46 | 3/27 | 1 | 0 | 0 | 0 |
| dev-paraphrase-0111 | 60 | 44 | 34/47 | 4/27 | 1 | 0 | 0 | 0 |
| dev-paraphrase-1000 | 60 | 44 | 30/43 | 0/27 | 1 | 0 | 0 | 0 |
| dev-paraphrase-1001 | 60 | 44 | 31/44 | 1/27 | 1 | 0 | 0 | 0 |
| dev-paraphrase-1010 | 60 | 44 | 32/45 | 2/27 | 1 | 0 | 0 | 0 |
| dev-paraphrase-1011 | 60 | 44 | 31/44 | 1/27 | 1 | 0 | 0 | 0 |
| dev-paraphrase-1100 | 60 | 44 | 30/43 | 0/27 | 1 | 0 | 0 | 0 |
| dev-paraphrase-1101 | 60 | 44 | 30/43 | 0/27 | 1 | 0 | 0 | 0 |
| dev-paraphrase-1110 | 60 | 44 | 32/45 | 2/27 | 1 | 0 | 0 | 0 |
| dev-paraphrase-1111 | 60 | 44 | 30/43 | 0/27 | 1 | 0 | 0 | 0 |
| dev-paraphrase-open-00 | 60 | 44 | 33/46 | 3/27 | 1 | 0 | 0 | 0 |
| dev-paraphrase-open-01 | 60 | 44 | 30/43 | 0/27 | 1 | 0 | 0 | 0 |
| dev-paraphrase-open-10 | 60 | 44 | 31/44 | 1/27 | 1 | 0 | 0 | 0 |
| dev-paraphrase-open-11 | 60 | 44 | 32/45 | 2/27 | 1 | 0 | 0 | 0 |

Tổng: 1380; hiểu hoàn toàn 73.33333333333333%; claim 1403/2461; đúng dòng 1403/1403; hỏi lại 356; không đủ căn cứ 552; bước từ dòng gạch 0; sai thầm lặng (i)/(ii)/(iii): 23/0/0; văn xuôi unchecked 0.

Thiếu bằng chứng chữ (readingMismatch = null) được xếp bảo thủ vào (ii).

Quy tắc 6 (chỉ thống kê): (i) có/không unchecked 23/0; (ii) có/không unchecked trước dòng sai đầu tiên 0/0.

- 22-arithmetic-route-length-dev-direct-b: (i); dòng lỗi dự đoán [], truth [1]; unchecked [1].
- 22-arithmetic-route-length-dev-symbolic-b: (i); dòng lỗi dự đoán [], truth [1]; unchecked [1].
- 22-arithmetic-route-length-dev-table-b: (i); dòng lỗi dự đoán [], truth [1]; unchecked [1].
- 22-arithmetic-route-length-dev-paraphrase-b: (i); dòng lỗi dự đoán [], truth [1]; unchecked [1].
- 22-arithmetic-route-length-dev-paraphrase-0001-b: (i); dòng lỗi dự đoán [], truth [1]; unchecked [1].
- 22-arithmetic-route-length-dev-paraphrase-0010-b: (i); dòng lỗi dự đoán [], truth [1]; unchecked [1].
- 22-arithmetic-route-length-dev-paraphrase-0011-b: (i); dòng lỗi dự đoán [], truth [1]; unchecked [1].
- 22-arithmetic-route-length-dev-paraphrase-0100-b: (i); dòng lỗi dự đoán [], truth [1]; unchecked [1].
- 22-arithmetic-route-length-dev-paraphrase-0101-b: (i); dòng lỗi dự đoán [], truth [1]; unchecked [1].
- 22-arithmetic-route-length-dev-paraphrase-0110-b: (i); dòng lỗi dự đoán [], truth [1]; unchecked [1].
- 22-arithmetic-route-length-dev-paraphrase-0111-b: (i); dòng lỗi dự đoán [], truth [1]; unchecked [1].
- 22-arithmetic-route-length-dev-paraphrase-1000-b: (i); dòng lỗi dự đoán [], truth [1]; unchecked [1].
- 22-arithmetic-route-length-dev-paraphrase-1001-b: (i); dòng lỗi dự đoán [], truth [1]; unchecked [1].
- 22-arithmetic-route-length-dev-paraphrase-1010-b: (i); dòng lỗi dự đoán [], truth [1]; unchecked [1].
- 22-arithmetic-route-length-dev-paraphrase-1011-b: (i); dòng lỗi dự đoán [], truth [1]; unchecked [1].
- 22-arithmetic-route-length-dev-paraphrase-1100-b: (i); dòng lỗi dự đoán [], truth [1]; unchecked [1].
- 22-arithmetic-route-length-dev-paraphrase-1101-b: (i); dòng lỗi dự đoán [], truth [1]; unchecked [1].
- 22-arithmetic-route-length-dev-paraphrase-1110-b: (i); dòng lỗi dự đoán [], truth [1]; unchecked [1].
- 22-arithmetic-route-length-dev-paraphrase-1111-b: (i); dòng lỗi dự đoán [], truth [1]; unchecked [1].
- 22-arithmetic-route-length-dev-paraphrase-open-00-b: (i); dòng lỗi dự đoán [], truth [1]; unchecked [1].
- 22-arithmetic-route-length-dev-paraphrase-open-01-b: (i); dòng lỗi dự đoán [], truth [1]; unchecked [1].
- 22-arithmetic-route-length-dev-paraphrase-open-10-b: (i); dòng lỗi dự đoán [], truth [1]; unchecked [1].
- 22-arithmetic-route-length-dev-paraphrase-open-11-b: (i); dòng lỗi dự đoán [], truth [1]; unchecked [1].
