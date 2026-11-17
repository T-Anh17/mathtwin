# @mathtwin/work — Lô 3.1

TS thuần, ES2022, không dùng API Node. Lô này chỉ xuất các kiểu trong `src/types.ts`, `vocabularyOf`, `compareWork` và hàm chuẩn hóa `claimKey`. Chưa triển khai parser, đọc ảnh, chấm kết hợp hay vòng hỏi lại.

`vocabularyOf` chỉ sao chép nhãn đỉnh, tên riêng cạnh (khử trùng, giữ thứ tự), loại bài, dạng câu hỏi, mã ý và chữ đề được truyền vào. Không trả id đỉnh, cạnh, trọng số hay đáp án.

`WorkTruth.prose` là danh sách dòng mô tả, bắt buộc cho corpus sinh tự động, tùy chọn cho real. `WorkLine.charConf` tùy chọn theo code point NFC; work-text luôn sinh trường này.

`WorkTruth.expected` dùng `null` hoặc bỏ trường cho bước/mã lỗi không có. Trường tùy chọn `WorkTruth.lines` bổ sung bản chép chuẩn để kiểm việc đọc sai và dòng gạch; không có chữ nguồn thì `readingMismatch` có thể là `null` (chưa đo được), không giả định có lỗi đọc.

`compareWork` bỏ metadata step/raw/conf/box khi so claim, sắp xếp khóa đối tượng, danh sách đỉnh/đỉnh lẻ và multiset cặp đầu mút vô hướng. Không khử trùng danh sách: liệt kê thừa vẫn khác truth. Giữ nguyên thứ tự đường đi và thứ tự claim. Ghép claim bằng LCS, khi hòa thì bỏ claim dự đoán trước. `sourceLines.accuracy` tính trên claim đã ghép, đòi đúng toàn bộ tập dòng nguồn. Không có claim ở cả hai phía thì precision/recall/đúng dòng là 1; chỉ một phía rỗng thì precision/recall là 0.

`CAN_XAC_NHAN` có `verdictCorrect: null`, được đếm riêng; `firstErrorCorrect` chỉ có mẫu số trên truth SAI. Lỗi đầu đúng cần giao dòng nguồn và trùng mã lỗi. Ba loại sai thầm lặng: `silentFalseCorrect` (i), `silentFalseWrongParse` (ii), `silentFalseWrongReading` (iii). SAI ở dòng sai hoặc SAI trên truth DUNG được xếp (iii) nếu có bằng chứng chữ khác; chữ đúng hoặc `readingMismatch: null` xếp bảo thủ vào (ii). `proseAsUnchecked` đếm các dòng prose truth bị đưa vào unchecked, khử trùng chỉ số dòng. `struckAsContent` đếm bước, không đếm số dòng.

Không tự mô phỏng trả lời hỏi lại trong lô này. Chỉ số sau hỏi lại thuộc Lô 3.4.
