# Setup — gym-vault-fork (bản fork cá nhân)

Plugin Obsidian **"Personal Vault"** (`id: gym-app`) — plan/log tập gym + dashboard, lưu dưới dạng note thuần trong vault. Bản fork này thêm: tạo ngày tập trong Configure, day-streak, body-weight, zebra list, Pomodoro link, Reading page… (chi tiết tính năng gốc xem `README.md`).

> ⚠️ **`main.js` và `styles.css` ở thư mục gốc là BUILD OUTPUT** — sinh ra từ `src/` bởi `./build.sh`. **Chỉ sửa trong `src/`.** (Hai file này được `.gitignore`; clone về phải build lại.)

## 1. Yêu cầu
- Node **≥ 18** + npm
- Một Obsidian vault (đường dẫn tới thư mục vault, vd `~/LifeVault`)

## 2. Clone & build
```bash
git clone <repo-url> gym-vault-fork
cd gym-vault-fork
./build.sh          # npm ci (lần đầu) → esbuild → node --check main.js → chạy test (~232 file test)
```
Build xanh = tạo ra `main.js` + `styles.css`. **Build KHÔNG tự cài vào vault.**

## 3. Deploy vào vault
```bash
GYM_VAULT_PATH="$HOME/LifeVault" ./scripts/deploy.sh
```
Script copy `main.js`, `styles.css`, `manifest.json` vào `<vault>/.obsidian/plugins/gym-app/`.

Rồi trong Obsidian: **Settings → Community plugins → bật "Personal Vault"** (đã bật thì Reload / tắt-bật lại để nạp bản mới).

## 4. Vòng lặp phát triển
1. Sửa code trong `src/*.js` (CSS nguồn: `src/styles.css`).
2. `./build.sh` (phải xanh — test là guard).
3. `GYM_VAULT_PATH="$HOME/LifeVault" ./scripts/deploy.sh` → Reload Obsidian.

## 5. Dữ liệu (trong vault, thư mục `Gym/`)
- `Plans/*.md` — giáo án: frontmatter `active: true/false`; ngày tập = heading `## <Tên> (<thứ>)` với thứ ∈ `mon…sun|any`; mỗi bài 1 dòng `- <Bài> | <sets> x <reps> @ <kg>`.
- `Exercises/*.md` — thư viện bài tập (frontmatter type/muscles/equipment/unit).
- `Workouts/*.md` — buổi đã log (bảng 1 dòng / 1 set).

## 6. Ghi chú fork
- Upstream: plugin "Personal Vault" của Ruan Pienaar (license **AGPL-3.0**, giữ nguyên `LICENSE`/`NOTICE`).
- Tính năng gốc + hướng dẫn người dùng: xem `README.md`.
