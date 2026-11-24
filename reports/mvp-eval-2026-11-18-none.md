Chế độ đọc đề: **none**. Không gọi B đọc đề; người dùng nhập form và đồ thị.

# Đo MVP đầu–cuối — 2026-11-18

Kết luận nghiệm thu: **chưa đủ căn cứ**. Chưa có ≥30 cặp ảnh thật viết tay có nhãn. Hoàn thành đo 35/40 trang synthetic-hw; 5 lỗi chạy. Chỉ xem hoàn tất chức năng khi các cổng kiểm tra trong phần xác minh đều xanh; không tự hạ ngưỡng nghiệm thu.

B đọc yêu cầu hiện **chưa đóng góp được ProblemSpec nào**: 0/35 (0.0%) trong các trang đã có checkpoint đọc đề; 35/40 trang phải nhập form dạng bài. Các issue trên 35 trang không có ProblemSpec: `nonpositive_weight` 28; `unsupported_task` 27; `unreadable_region` 27; `missing_weight` 24; `read_failed` 8; `directed_graph` 3. Đây là rủi ro đọc đề, không được diễn giải thành B đã dựng được yêu cầu.

Gợi ý luật Lô 5.2 (chỉ từ chữ đề B đã lưu, luôn chờ xác nhận): có gợi ý 0/35; đúng dạng 0/35; đúng cả tham số 0/35; gợi ý sai 0/35. Công nhập form cho các trang có checkpoint: trước 160; sau 160. Gợi ý sai không tự vào spec; mô phỏng vẫn dùng thao tác sửa form theo truth.

Máy tính: win32 x64; Intel(R) Core(TM) i7-8700 CPU @ 3.20GHz; 12 logical CPUs; 31.9 GiB RAM; Node v22.23.4. **Mọi thời gian dưới đây là Node trên máy tính, không phải điện thoại.** B cục bộ Qwen3-VL-2B Q4_K_M + mmproj F16, cạnh ảnh tối đa 768, CPU 4 threads, GPU 0; llama-server khởi động/dừng theo mỗi lần gọi adapter. Không tải model mới, không adb. Số điện thoại cũ khoảng 49 s/trang (vivo X100s Pro), không suy ra từ số máy tính.

Nguồn: 40 ảnh 1000×1440, 10 đề gốc × 4 biến thể font/phối cảnh; 20 bài đúng, 20 bài sai. Mỗi ảnh chứa cả đề và bài, được dùng làm cả hai đầu vào; không phải 40 cặp độc lập hoặc 80 ảnh riêng, cũng chưa thay thế bộ chuẩn tối thiểu 100 cặp của đặc tả 8.1. Không cắt bỏ bài làm trước khi B đọc đề: có nguy cơ rò đáp án trong trang tổng hợp. real: 0 cặp, chưa đo.

| Nguồn | Hoàn tất | Đọc đề đúng hoàn toàn ≥90%; phần lỗi 100% gắn cờ | Giải đúng khi đề đúng 100% | Kết luận đúng/sai ≥95% | Bước sai đầu + mã lỗi ≥90% |
| --- | ---: | --- | --- | --- | --- |
| synthetic-hw | 35/40 | 0/40 (0.0%); lỗi có cờ kiểm được 27/40 | 40/40 (100.0%) | 30/40 (75.0%) | 16/20 (80.0%) |
| real | 0 | chưa đo | chưa đo | chưa đo | chưa đo |

Chỉ số đọc đề đo **trước xác nhận**, với B đọc yêu cầu và D làm nháp hình; không tính đồ thị truth đã sửa thành đọc đúng. B riêng (trước chọn D): đúng hoàn toàn 0/40 (0.0%), lỗi có cờ kiểm được 27/40. Chưa có số khâu đọc đề cho 0 trang; các tỷ lệ là cận dưới nếu còn trang chưa đo. Nháp D không có glyph model như app, cần soát/sửa nhãn, cạnh, trọng số. Có cờ toàn đồ thị chỉ là cảnh báo thô, không đạt yêu cầu ≥90% đọc hoàn toàn.

Chỉ số 1 cần đọc là **13/40 trang đề sai không gắn cờ đầy đủ**, không chỉ phần có cờ. Dù đồ thị D luôn qua màn soát và yêu cầu được nhập tay, điều đó chỉ chặn sai đầu–cuối trong phép mô phỏng; không làm B đọc đề đúng hơn.

Sau xác nhận: 40/40 đề khớp truth (tính cả khâu đã hoàn tất trên trang lỗi đọc bài làm). Truth chỉ được dùng để trả lời uncertain, nhập form khi thiếu yêu cầu và sửa đồ thị D; yêu cầu sai mà tự tin không được tự sửa. Chỉ số giải kiểm đáp án bằng bộ đối chiếu độc lập trong mvp-oracle.ts (đếm, duyệt, Euler theo tập cạnh, hoán vị Hamilton/TSP, Floyd–Warshall, ghép cặp vét cạn, kiểm tính hợp lệ hành trình). Không dùng solve(truth) so với chính solve(truth). Không phải phép kiểm toàn bộ lời văn giải thích.

Mẫu số kết luận gồm **mọi cặp kế hoạch**, kể cả lỗi đọc, CẦN XÁC NHẬN/KHÔNG ĐỦ CĂN CỨ, không bỏ bài khó. Bước sai dùng dòng nguồn sau căn dòng + mã lỗi, cho phép tách/gộp dòng, không so số thứ tự bước parser với truth một cách máy móc. Bài SAI truth: 20; còn hỏi lại 1; không đủ căn cứ 4; không có kết luận vì lỗi đọc 5. Các khâu trước lỗi được chấm độc lập từ checkpoint, không giả vờ đã đi tới kết quả cuối. Lệnh trả mã khác 0 khi còn lỗi; phép đo không đạt điều kiện hoàn tất trọn mọi trang.

Sai thầm lặng sau mô phỏng (định nghĩa Lô 3.6): (i) ĐÚNG sai 0; (ii) SAI hiểu/chấm sai 0; (iii) SAI do đọc sai tại dòng báo lỗi 0. Tổng 0 bài. Kiểm tra riêng chỉ số 4: 0 bài báo SAI nhưng sai dòng/mã lỗi (có thể trùng nhóm sai thầm lặng; mã lỗi sai cùng dòng có thể không thuộc (ii)/(iii)).

Nguyên nhân loại trừ nhau theo audit Lô 3.6: (a) mất dòng 0; (b) đọc sai conf cao 0; (c) chữ hình/đề lẫn lời giải 0; (d) hiểu/chấm/nguồn lỗi khác 0. Đây là quy tắc quy nguyên nhân vận hành, không chứng minh nhân quả. Chi tiết chữ, căn dòng và bằng chứng trước/sau nằm trong JSON kèm báo cáo.

Không có bài sai thầm lặng còn lại theo định nghĩa trên.

## Kết luận lệch theo nguyên nhân

| Bài | Truth → kết luận | Nguyên nhân chính | Thuộc |
| --- | --- | --- | --- |
| 07-connectivity-components-dancing-perspective | DUNG → KHONG_DU_CAN_CU | Tự đánh gạch dòng lời giải không có nét gạch (dòng 2) | sản phẩm (gạch xóa) |
| 07-connectivity-components-patrick-perspective | SAI → KHONG_DU_CAN_CU | Box B gộp dòng bị gạch với dòng lời giải, dòng lời giải mất theo (dòng 3) | sản phẩm (box B + gạch xóa) |
| 12-dijkstra-tied-order-patrick-perspective | SAI → CAN_XAC_NHAN | Còn câu hỏi chưa trả lời được (dòng 15, 18, 22) | sản phẩm (hỏi lại) |
| 19-four-true-false-items-patrick-straight | DUNG → KHONG_DU_CAN_CU | Dòng học sinh bị đổi thành đề/hình (box B lệch vùng), không được hỏi (dòng 10) | sản phẩm (bộ đọc + lọc vùng) |
| 20-four-choice-question-dancing-perspective | DUNG → KHONG_DU_CAN_CU | Dòng học sinh bị đổi thành đề/hình (box B lệch vùng), không được hỏi (dòng 9) | sản phẩm (bộ đọc + lọc vùng) |

Nguyên nhân được tính từ phiên cuối và phép căn dòng Lô 3.6 trên từng dòng truth mang mệnh đề, không dựa vào tên bài; thứ tự ưu tiên: còn câu hỏi → gạch không có nét → box gộp dòng gạch → dòng bị đổi thành đề/hình → dòng vắng. Lỗi của bộ mô phỏng (placeholder/dòng đang hỏi bị bỏ qua) đã sửa ở vòng 2 nên không còn trong bảng; mọi hàng trên là rủi ro sản phẩm, chỉ ghi nhận ở lô này, không tự sửa ngoài phạm vi review.

Gạch xóa tự động trên 35 bài hoàn tất: 19/143 dòng lời giải/bảng bị đánh gạch; 14 dòng có nét gạch thật của truth (tâm dọc của dòng gạch truth nằm trong box và chồng theo chiều ngang), 5 dòng không có nét gạch nào. Dòng có nét gạch vẫn có thể làm mất chữ khi box B gộp dòng bị gạch với dòng lời giải bên cạnh. Đây là rủi ro sai thầm lặng: một dòng mệnh đề tự gạch với điểm ≥0,8 không qua cổng hỏi lại, và bài SAI không có bước soát nên kết luận có thể đổi mà không biết.

Công và thời gian đầy đủ bên dưới chỉ tính 35 bài hoàn tất; 5 trang lỗi có công/thời gian dở dang, được tách riêng, không coi bằng 0.

| Công người dùng (mỗi bài hoàn tất) | Tổng | TB | Max |
| --- | ---: | ---: | ---: |
| Câu uncertain đề | 0 | 0.00 | 0 |
| Nhập form thiếu yêu cầu/dạng câu hỏi | 160 | 4.57 | 10 |
| Câu hỏi bài làm (gồm soát dòng SAI) | 102 | 2.91 | 16 |
| Khoanh vùng bài làm | 29 | 0.83 | 1 |
| Soát trước kết luận (tính 1) | 16 | 0.46 | 1 |
| Nhóm dòng sửa trong soát | 8 | 0.23 | 3 |
| Sửa đồ thị từ nháp D | 247 | 7.06 | 14 |
| Tự nhập đồ thị (đối chứng) | 332 | 9.49 | 16 |
| Tổng công theo định nghĩa (câu đề + câu bài + công đồ thị + soát; công đồ thị: none = tự nhập, b = sửa nháp D) | 450 | 12.86 | 28 |

Câu hỏi đề + bài trung bình 2.91/bài. Khoanh vùng và nhập form được báo riêng, không giấu công ngoài công thức. Công D dùng nguyên figureEffort Lô 2.12: 1 lần chạm/ô gõ, ghép đỉnh theo vị trí, cạnh theo cặp đầu và bội số, cạnh gắn đỉnh xóa biến mất miễn phí, nhập mọi trọng số/tên; tự nhập có nhãn A… tự đặt. Tọa độ truth lấy từ đường data-vertex trong source.svg rồi áp biến đổi phối cảnh của bộ sinh; labelBox cao 27 px theo cỡ chữ layout (ước lượng hình học được khai báo). Đây là công mô phỏng, chưa đo thao tác người thật.

Giả định **lạc quan**: người dùng trả đúng mọi câu hỏi bằng chữ truth, giữ nguyên cả lỗi toán của học sinh; căn dòng text DP Lô 3.6 độc lập claims/grade. Chỉ placeholder mất dòng đã hiện thành câu hỏi dùng giao dải box với layout để trả lời. Không chèn dòng truth hoàn toàn vắng khỏi danh sách. Khi cổng soát xuất hiện, người dùng phát hiện đọc sai/nhầm gạch/vùng sai ở dòng thực sự hiện trong danh sách (kể cả danh sách bỏ qua mà UI cho mở); soát tính 1, số nhóm sửa báo riêng. Người dùng không tự sửa dòng chưa được hỏi trên bài SAI, trừ readingCheck tại dòng lỗi. Truth chưa hiểu sau một lần trả lời vẫn để CẦN XÁC NHẬN. Khoanh vùng chỉ khi flow yêu cầu; OCR thiếu box thì đọc crop thật bằng B, không gán box truth vào OCR.

| Thời gian máy tính (ms) | TB | p50 | p90 | Max |
| --- | ---: | ---: | ---: | ---: |
| decode | 23.9 | 23.7 | 29.8 | 42.1 |
| problemRead | 0.0 | 0.0 | 0.0 | 0.0 |
| figureDraft | 2210.7 | 2234.7 | 2903.4 | 5104.3 |
| confirm | 0.5 | 0.4 | 0.7 | 3.1 |
| solve | 0.3 | 0.1 | 0.4 | 2.0 |
| workRead | 70913.5 | 70338.9 | 108400.1 | 152919.6 |
| region | 20951.4 | 26346.6 | 37878.3 | 90958.0 |
| inspection | 81.3 | 79.6 | 131.4 | 149.5 |
| grade | 3.2 | 1.8 | 5.8 | 40.6 |
| replay | 182.2 | 91.3 | 380.5 | 1683.3 |
| view | 1.2 | 0.8 | 2.9 | 4.5 |
| Tổng máy (không chờ người trả lời) | 73414.9 | 72791.3 | 111176.9 | 159825.1 |

solve/grade được đo bằng thao tác thật của sessionReducer; grade là tổng mọi lần chấm, gồm lần đầu và các lần trong replay (không cộng hai lần). region gồm xử lý/khi cần đọc crop, đã nằm trong workRead; inspection đo lại lọc vùng/mất dòng trên OCR gốc khi chấm lại. replay gồm căn dòng và mô phỏng, chưa gồm thời gian con người. decode gồm giải mã PNG và nạp chú thích bộ đo. Khởi động model nằm trong thời gian đọc. Tổng cộng các khâu, không gồm I/O ghi checkpoint và đối chiếu chỉ số sau chấm. Mục tiêu 15 s đầu–cuối: 0/40; solve + tổng grade <1 s: 35/35 bài đo đầy đủ (trang lỗi chưa có đủ thời gian grade).

| Bài | Đề đúng sau xác nhận | Kết luận / truth | Đúng lỗi đầu | Câu đề + bài | Sửa D | Soát | Tổng máy (s) |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| 01-elements-multigraph-dancing-perspective | true | DUNG / DUNG | — | 3 | 11 | 1 | 84.27 |
| 01-elements-multigraph-dancing-straight | true | SAI / SAI | true | 3 | 10 | 0 | 111.18 |
| 01-elements-multigraph-patrick-perspective | true | SAI / SAI | true | 2 | 12 | 1 | 111.53 |
| 01-elements-multigraph-patrick-straight | true | DUNG / DUNG | — | 4 | 8 | 1 | 116.62 |
| 07-connectivity-components-dancing-perspective | true | KHONG_DU_CAN_CU / DUNG | — | 0 | 6 | 0 | 77.24 |
| 07-connectivity-components-dancing-straight | true | SAI / SAI | true | 3 | 4 | 0 | 62.93 |
| 07-connectivity-components-patrick-perspective | true | KHONG_DU_CAN_CU / SAI | false | 0 | 6 | 0 | 62.64 |
| 07-connectivity-components-patrick-straight | true | DUNG / DUNG | — | 3 | 4 | 1 | 48.39 |
| 09-euler-loop-parallel-dancing-perspective | true | DUNG / DUNG | — | 3 | 11 | 1 | 61.09 |
| 09-euler-loop-parallel-dancing-straight | true | SAI / SAI | true | 2 | 8 | 0 | 86.81 |
| 09-euler-loop-parallel-patrick-perspective | true | SAI / SAI | true | 2 | 11 | 0 | 48.98 |
| 09-euler-loop-parallel-patrick-straight | true | DUNG / DUNG | — | 2 | 8 | 1 | 53.74 |
| 10-hamilton-reverse-cycle-dancing-perspective | true | DUNG / DUNG | — | 3 | 8 | 1 | 74.91 |
| 10-hamilton-reverse-cycle-dancing-straight | true | SAI / SAI | true | 2 | 5 | 0 | 86.69 |
| 10-hamilton-reverse-cycle-patrick-perspective | true | SAI / SAI | true | 2 | 8 | 0 | 69.13 |
| 10-hamilton-reverse-cycle-patrick-straight | true | DUNG / DUNG | — | 1 | 5 | 1 | 86.42 |
| 12-dijkstra-tied-order-patrick-perspective | true | CAN_XAC_NHAN / SAI | false | 16 | 11 | 0 | 159.83 |
| 13-tsp-tied-student-tour-patrick-perspective | true | SAI / SAI | true | 2 | 13 | 0 | 68.49 |
| 13-tsp-tied-student-tour-patrick-straight | true | DUNG / DUNG | — | 4 | 10 | 1 | 83.45 |
| 14-postman-alternative-matching-dancing-perspective | true | DUNG / DUNG | — | 5 | 14 | 1 | 76.48 |
| 14-postman-alternative-matching-dancing-straight | true | SAI / SAI | true | 5 | 10 | 1 | 88.12 |
| 14-postman-alternative-matching-patrick-perspective | true | SAI / SAI | true | 2 | 10 | 0 | 72.79 |
| 14-postman-alternative-matching-patrick-straight | true | DUNG / DUNG | — | 4 | 11 | 1 | 77.71 |
| 18-short-answer-degree-dancing-perspective | true | DUNG / DUNG | — | 1 | 5 | 1 | 58.09 |
| 18-short-answer-degree-dancing-straight | true | SAI / SAI | true | 6 | 3 | 0 | 35.97 |
| 18-short-answer-degree-patrick-perspective | true | SAI / SAI | true | 3 | 3 | 0 | 41.22 |
| 18-short-answer-degree-patrick-straight | true | DUNG / DUNG | — | 5 | 3 | 1 | 44.15 |
| 19-four-true-false-items-dancing-perspective | true | DUNG / DUNG | — | 2 | 3 | 1 | 68.08 |
| 19-four-true-false-items-dancing-straight | true | SAI / SAI | true | 3 | 3 | 0 | 58.39 |
| 19-four-true-false-items-patrick-perspective | true | SAI / SAI | true | 1 | 3 | 0 | 79.43 |
| 19-four-true-false-items-patrick-straight | true | KHONG_DU_CAN_CU / DUNG | — | 1 | 3 | 0 | 57.18 |
| 20-four-choice-question-dancing-perspective | true | KHONG_DU_CAN_CU / DUNG | — | 1 | 5 | 0 | 53.89 |
| 20-four-choice-question-dancing-straight | true | SAI / SAI | true | 1 | 3 | 0 | 81.51 |
| 20-four-choice-question-patrick-perspective | true | SAI / SAI | true | 2 | 6 | 0 | 75.07 |
| 20-four-choice-question-patrick-straight | true | DUNG / DUNG | — | 3 | 3 | 1 | 47.11 |

Lỗi chạy (giữ trạng thái chưa có kết luận, không tự retry hay nhập toàn bài bằng truth):
- 12-dijkstra-tied-order-dancing-perspective: Không thể đọc ảnh; hãy kiểm tra model, kết nối llama-server và xác suất token.; thời gian khâu đã lưu (ms) {"problemRead":81466.88920000009,"figureDraft":4664.125500000082,"workRead":52732.023099999875}. Thời gian lượt thất bại chưa có checkpoint hoàn tất không nằm trong bảng TB. Giới hạn cấu hình crop là 180 s, tổng lượt ngoài bị chặn bởi run-bounded. Log cũ chỉ có thông báo đọc tổng quát, không đủ để kết luận nguyên nhân cụ thể là timeout/JSON/xác suất token; bộ đo mới giữ code/reason khi có.
- 12-dijkstra-tied-order-dancing-straight: Không thể đọc ảnh; hãy kiểm tra model, kết nối llama-server và xác suất token.; thời gian khâu đã lưu (ms) {"problemRead":82475.32110000029,"figureDraft":5066.236899999902,"workRead":140714.01909999968}. Thời gian lượt thất bại chưa có checkpoint hoàn tất không nằm trong bảng TB. Giới hạn cấu hình crop là 180 s, tổng lượt ngoài bị chặn bởi run-bounded. Log cũ chỉ có thông báo đọc tổng quát, không đủ để kết luận nguyên nhân cụ thể là timeout/JSON/xác suất token; bộ đo mới giữ code/reason khi có.
- 12-dijkstra-tied-order-patrick-straight: Không thể đọc ảnh; hãy kiểm tra model, kết nối llama-server và xác suất token.; thời gian khâu đã lưu (ms) {"problemRead":105499.59899999993,"figureDraft":4198.994200000074,"workRead":88689.29790000012}. Thời gian lượt thất bại chưa có checkpoint hoàn tất không nằm trong bảng TB. Giới hạn cấu hình crop là 180 s, tổng lượt ngoài bị chặn bởi run-bounded. Log cũ chỉ có thông báo đọc tổng quát, không đủ để kết luận nguyên nhân cụ thể là timeout/JSON/xác suất token; bộ đo mới giữ code/reason khi có.
- 13-tsp-tied-student-tour-dancing-perspective: Không thể đọc ảnh; hãy kiểm tra model, kết nối llama-server và xác suất token.; thời gian khâu đã lưu (ms) {"problemRead":106740.2061999999,"figureDraft":2725.769599999767,"workRead":128843.7992999996}. Thời gian lượt thất bại chưa có checkpoint hoàn tất không nằm trong bảng TB. Giới hạn cấu hình crop là 180 s, tổng lượt ngoài bị chặn bởi run-bounded. Log cũ chỉ có thông báo đọc tổng quát, không đủ để kết luận nguyên nhân cụ thể là timeout/JSON/xác suất token; bộ đo mới giữ code/reason khi có.
- 13-tsp-tied-student-tour-dancing-straight: Không thể đọc ảnh; hãy kiểm tra model, kết nối llama-server và xác suất token.; thời gian khâu đã lưu (ms) {"problemRead":128820.02730000019,"figureDraft":2557.561999999918,"workRead":131932.35300000012}. Thời gian lượt thất bại chưa có checkpoint hoàn tất không nằm trong bảng TB. Giới hạn cấu hình crop là 180 s, tổng lượt ngoài bị chặn bởi run-bounded. Log cũ chỉ có thông báo đọc tổng quát, không đủ để kết luận nguyên nhân cụ thể là timeout/JSON/xác suất token; bộ đo mới giữ code/reason khi có.

Quyết định đi/dừng: **dừng ở Lô 4.7 để review; chưa đủ căn cứ nghiệm thu**. Chưa có ảnh thật và phải xét riêng từng ngưỡng đọc/giải/chấm/thời gian nêu trên; build/test xanh chỉ chứng minh cổng chức năng. Đề xuất tiếp: thu ≥30 cặp ảnh thật có nhãn; reviewer xét nguyên nhân sai, công xác nhận và độ chậm của B trước khi giao lô khác. Không tự sửa parser/core hoặc tự chạy bước đề xuất.

Xác minh cổng sẽ được ghi sau khi chạy; npm test chỉ dùng adapter giả lập, không suy luận thật.


## So sánh chế độ đọc đề

| Chế độ | Công nhập form | Công đồ thị tự nhập | Công nháp D | Thời gian B đọc đề (ms) | Đề xác nhận khớp truth | Kết luận đúng | Tổng công |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| none | 160 | 332 | 247 | 0 | 35/35 | 30/35 | 610 |
| b | 118 | 332 | 247 | 2795995.3 | 35/35 | 30/35 | 649 |

Tổng công = nhập form + câu đề + câu bài + công đồ thị (none: tự nhập từ đồ thị rỗng; b: sửa nháp D) + soát. 35/35 mẫu none có fixture đổi sau checkpoint: phần bài làm (OCR, câu hỏi, soát, kết luận) và công đồ thị giữ nguyên như lượt b đã ghi; chỉ phần đề được thay bằng nhập form từ đầu theo đề đã xác nhận trong cùng checkpoint.

Đã chạy lại flow xác nhận/chấm trên OCR gốc B và nháp D đã lưu của cùng phép đo. Không tái sử dụng chữ đã sửa của mô phỏng cũ. Thời gian đọc B/D giữ số thật lần suy luận, thời gian xử lý/soát/chấm đo lại; tổng là thời gian các khâu ghép lại, không phải một đồng hồ liên tục mới.
