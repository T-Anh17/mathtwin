# MathTwin — Gia sư Lý thuyết đồ thị

Nhận ảnh đề bài và ảnh bài làm Lý thuyết đồ thị, trả về lời giải đúng từng bước và kết quả chấm chỉ ra bước sai đầu tiên.

- Đặc tả phạm vi & chức năng: [docs/spec.md](docs/spec.md)
- Bản đặc tả online (sửa, comment): https://claude.ai/artifact/8gqTghmgaUBgPNK4GmzB65

## Cấu trúc dự kiến

```
mathtwin/
├── docs/               # đặc tả, tài liệu tham khảo
├── packages/core/      # lõi giải + chấm (TypeScript thuần, có unit test)
├── apps/web/           # giao diện React + TypeScript (PWA)
├── server/             # API trung gian gọi vision LLM
└── testdata/           # bộ test chuẩn: ảnh đề, ảnh bài làm, nhãn chuẩn
```
