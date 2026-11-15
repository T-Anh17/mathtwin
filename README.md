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

## Phát triển lõi TypeScript

Yêu cầu Node.js 22.12 trở lên và npm 10 trở lên.

```sh
npm install
npm test
npm run build
```

`npm test` kiểm tra kiểu strict và chạy Vitest (gồm kiểm thử thuộc tính bằng
fast-check). Lô 1.1 cung cấp kiểu dữ liệu, kiểm tra đề và các hàm đồ thị cơ bản;
xem [API hiện có của core](packages/core/README.md).

## App Android

Khung Capacitor 8 và màn Đo: [apps/mobile/README.md](apps/mobile/README.md).
`npm run mobile:build` build APK debug riêng; không cài lên thiết bị hoặc tải model.
