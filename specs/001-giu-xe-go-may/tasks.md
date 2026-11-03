---

description: "Task list for App Giữ Xe Gò Mây Arena"
---

# Tasks: App Giữ Xe Gò Mây Arena

**Input**: Design documents from `/specs/001-giu-xe-go-may/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md

**Tests**: Có. Constitution ("Quy trình phát triển") bắt buộc kiểm thử tự động cho luồng gửi/trả xe và
đồng bộ offline. Thêm unit test cho logic dùng chung (`web/shared/`). Viết test trước, chạy thấy FAIL
rồi mới làm phần code.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- `web/` — PWA tĩnh (GitHub Pages), ES modules, không build
- `web/shared/` — logic thuần dùng chung web + Apps Script + test
- `gas/` — Google Apps Script (V8, không có module; `gas/Shared.js` được sinh từ `web/shared/`)
- `tests/unit/` (Vitest), `tests/e2e/` (Playwright), `scripts/` (tiện ích Node)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 Create directory structure per plan.md: `web/{css,js/screens,shared,vendor,icons}`, `gas/`, `tests/{unit,e2e/fixtures}`, `scripts/`, `docs/`
- [ ] T002 Create `package.json` (type: module) with devDependencies `vitest`, `@playwright/test`, `@google/clasp` (exact versions, no ranges) and scripts: `test` (vitest run), `test:e2e` (playwright test), `serve` (node scripts/serve.mjs), `build:gas` (node scripts/build-gas.mjs), `push:gas` (npm run build:gas && clasp push)
- [ ] T003 [P] Create `scripts/serve.mjs`: zero-dependency Node static server serving `web/` on port 5173 with correct MIME types for `.js`, `.webmanifest`, `.png`
- [ ] T004 [P] Add vendored libraries in `web/vendor/`: `jsQR.js` (jsqr 1.4.0), `qrcode-generator.js` (qrcode-generator 1.4.4), `idb.js` (idb 8.0.0 ESM build); record source URLs and versions in `web/vendor/README.md`
- [ ] T005 [P] Create `gas/appsscript.json` (runtimeVersion V8, timeZone `Asia/Ho_Chi_Minh`, webapp `executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS`, oauthScopes spreadsheets, drive, script.external_request, script.scriptapp) and `.clasp.json.example` with `rootDir: "gas"`
- [ ] T006 [P] Create `vitest.config.js` (include `tests/unit/**/*.test.js`) and `playwright.config.js` (Chromium, launch args `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`, permissions `camera`, webServer `npm run serve`, baseURL `http://localhost:5173`)
- [ ] T007 [P] Create `.gitignore` (node_modules, .clasp.json, test-results, playwright-report)
- [ ] T008 Create `scripts/build-gas.mjs`: concatenate `web/shared/*.js` in dependency order (ticket, pricing, sessions, merge, server-ops, report, compare), **skipping files that do not exist yet**, strip `import` lines and `export` keywords, write `gas/Shared.js` with header `// GENERATED from web/shared — do not edit`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Tests (write first, must FAIL)

- [ ] T009 [P] Unit tests in `tests/unit/ticket.test.js`: `formatNo(7) === "007"`; `parseTypedNumber("037") === 37` and `("37") === 37`; QR round-trip `encodeQr`/`parseQr` for `GM1|20261103|037|<ck>` with `ck` = first 6 hex chars of HMAC-SHA256(secret, `"20261103|037"` (number always 3 digits, lowercase hex)); tampered `ck` → `TICKET_INVALID`; `suggestNext` returns last+1 and skips numbers currently `in_lot`; `validateForCheckin` returns `TICKET_IN_USE`, `TICKET_USED`, `TICKET_WRONG_DATE` (ticketDate ≠ today), and returns `TICKET_OUT_OF_RANGE` (> max `toNo` of today's batches, unless `noTicket`) as a **non-blocking warning** `{ok:true, warning}` — never a block, because a device offline may not know a batch created later (constitution II); `computeSkipped` lists unused numbers below the highest used
- [ ] T010 [P] Unit tests in `tests/unit/pricing.test.js`: defaults motorbike 5000, ebike 5000, bicycle 5000, lostFee 10000; price picked = PriceRule with latest `effectiveFrom` ≤ `inAt`; lost checkout fee = lostFee (total, not added to normal price)
- [ ] T011 [P] Unit tests in `tests/unit/sessions.test.js`: transitions `in_lot→returned` (requires `outPhotoId`, fee = `priceAtIn`), `in_lot→lost` (requires `note` else `NOTE_REQUIRED`), `in_lot→cancelled` via undo only if same staff and ≤ 10 s after `inAt` else `UNDO_EXPIRED`, `provisional` requires `note`; `returned` cannot be checked out again; no transition removes a session; `normalizePlate("59X1-123.45") === "59X112345"`

### Shared logic

- [ ] T012 [P] Implement `web/shared/ticket.js` to pass T009: `formatNo`, `parseTypedNumber`, `encodeQr(date, no, hmacHex)`, `parseQr(text, hmacHex)` (hmacHex injected: web uses `crypto.subtle`, gas uses `Utilities.computeHmacSha256Signature`), `suggestNext`, `validateForCheckin`, `validateForCheckout`, `computeSkipped`, `remainingTickets(batches, sessions)` = max `toNo` today − highest number used today across all synced sessions (skipped numbers are not counted as remaining); error codes exactly as in `contracts/api.md`
- [ ] T013 [P] Implement `web/shared/pricing.js` to pass T010: `DEFAULT_PRICES`, `priceFor(priceRules, vehicleType, inAt)`, `lostFee(priceRules, at)`; `vehicleType` enum `motorbike | ebike | bicycle`
- [ ] T014 [P] Implement `web/shared/sessions.js` to pass T011: `STATUS` = `in_lot | returned | lost | provisional | cancelled`, `PLATE_STATUS` = `pending | read | unreadable | manual`, `applyOp(session, op, now)` returning `{session}` or `{error}`, `normalizePlate`
- [ ] T015 [P] Unit tests in `tests/unit/server-ops.test.js` then implement `web/shared/server-ops.js` `applyPush(state, ops, now)` as pure logic (no Apps Script APIs): idempotency by `opId` (`duplicate`), per-op results `applied | duplicate | conflict | rejected`, returns changed rows + audit entries; rules for each op type are added in their user-story tasks; `gas/Sessions.js` and `tests/e2e/fixtures/mock-api.js` MUST both use it
- [ ] T016 Run `npm run build:gas` and verify `gas/Shared.js` is generated and contains no `export`/`import`

### Apps Script backend foundation

- [ ] T017 Implement `gas/Setup.js` `setup()`: create spreadsheet sheets with header rows exactly matching data-model.md fields — `Sessions`, `TicketBatches`, `Photos`, `Alerts`, `Prices`, `Staff`, `Tokens`, `Shifts`, `Audit`, `Config`, `Ops` (opId, type, staffId, appliedAt, result); create Drive folder `GoMay-GiuXe/Anh`; insert default Prices row; create first manager "Quản lý" with random 6-digit PIN logged once; set `Config.alertThreshold = 0.7`; ScriptProperty `REV = 0`; install nightly trigger `nightlyCleanup` and 5-minute trigger `retryFailedAnalyses`
- [ ] T018 Implement `gas/Db.js`: `readObjects(sheetName)`, `appendObject`, `updateById`, `findBy`, `withLock(fn)` (LockService.getScriptLock, wait 10 s, else throw `BUSY`; lock sections MUST only read/write Sheets — never call `UrlFetchApp` or `DriveApp` inside), `nextRev()` (increment ScriptProperty `REV` inside lock), `audit(staffId, deviceId, action, sessionId, detail)` append-only
- [ ] T019 Implement `gas/Main.js` `doPost(e)`: parse `text/plain` JSON body `{action, token, deviceId, data}`, route to handlers, verify token (sheet `Tokens`, not `revoked`) except `login`, enforce role (🔴 actions manager-only → `FORBIDDEN`), return `ContentService` JSON `{ok:true,data}` / `{ok:false,error:{code,message}}` with Vietnamese messages
- [ ] T020 Implement `gas/Auth.js`: `login({staffName, pin})` → check `Staff.active`, compare `pinHash` = SHA-256 hex of `staffId + ":" + pin`; after 5 failed attempts for a name within 15 min return `BAD_LOGIN` and lock for 15 min (CacheService); issue random token row in `Tokens`; return `{token, staff, qrSecret: ScriptProperty QR_SECRET, serverTime}`; `listStaff`, `saveStaff` (manager; never delete, toggle `active`; audit `staff_change`)
- [ ] T021 Implement `gas/Sessions.js` skeleton: `push({ops})` — for each op (≤ 50) check `Ops` sheet for `opId` → `duplicate`; else apply them with `applyPush` from `gas/Shared.js` (generated from `web/shared/server-ops.js`) inside `withLock`, persist changed rows, record in `Ops`, bump `rev`, return results per contract; `pull({sinceRev})` — `full:true` (all `in_lot` + today's sessions, prices, batches, new alerts) when `sinceRev = 0` or older than 2 days, else rows with `rev > sinceRev`, including alerts whose status changed since `sinceRev` (so alerts resolved on one device disappear on others)
- [ ] T022 Implement `createBatch` data part in `gas/Admin.js` (manager): `{date, count}` → `fromNo` = max `toNo` for date + 1 (or 1), append `TicketBatches` row, audit `create_batch`, return `{date, fromNo, toNo, tickets:[{no, qr}]}` using `encodeQr` from `gas/Shared.js` (UI comes in US3)

### PWA client foundation

- [ ] T023 [P] Create `web/index.html` (app shell, `<main id="screen">`, header with counters, loads `js/app.js` as module), `web/manifest.webmanifest` (name "Giữ Xe Gò Mây", display standalone, orientation portrait, theme color), icons `web/icons/icon-192.png` and `web/icons/icon-512.png`
- [ ] T024 [P] Create `web/css/app.css`: base font ≥ 20px, buttons ≥ 56px tall, primary action fixed at bottom for one-hand use, high-contrast colors readable outdoors, huge-number style (≥ 72px) for ticket numbers
- [ ] T025 [P] Create `web/sw.js`: versioned cache of all app-shell files (html, css, js, vendor, icons); cache-first for shell, network-only for Apps Script URL; skipWaiting + clients.claim
- [ ] T026 [P] Create `web/config.js` exporting `API_URL` placeholder and `POLL_MS = 3000`
- [ ] T027 [P] Implement `web/js/api.js`: `call(action, data)` → `fetch(API_URL, {method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"}, body: JSON.stringify({action, token, deviceId, data})})`, 20 s timeout via AbortController, returns `{ok, data, error}`; network failure → `{ok:false, error:{code:"OFFLINE"}}`
- [ ] T028 Implement `web/js/db.js` with idb: database `gomay` v1, stores `sessions` (keyPath `id`, indexes `byTicket` [`ticketDate`,`ticketNo`], `byStatus`), `photos` (keyPath `id`, indexes `bySession`, `byUploadState`; fields per data-model + `blob`, `uploadState` `pending | uploading | done | failed`, `attempts`), `outbox` (keyPath `opId`, index `createdAt`), `meta` (key/value: `deviceId`, `token`, `staff`, `qrSecret`, `lastRev`, `nextTicketNo:<YYYYMMDD>`); helper `saveCheckin(session, photo, op)` writes all three in ONE transaction; call `navigator.storage.persist()` on first run
- [ ] T029 [P] Unit tests in `tests/unit/merge.test.js` then implement `web/shared/merge.js`: `mergeServerSession(local, server, pendingOpIds)` — server row wins unless local has a pending op for that session; conflict flag from server is always kept
- [ ] T030 Implement `web/js/sync.js`: call `push` **immediately** whenever an op is enqueued (debounce 300 ms, so another device sees it within 5 s — FR-014), and also loop every `POLL_MS` while `navigator.onLine` and page visible — `push` up to 50 outbox ops, delete applied/duplicate ops, keep `conflict`/`rejected` results on the session for display; then `pull(lastRev)` and merge via `web/shared/merge.js`; exponential backoff (2 s → 60 s) on failure; emits `sync:changed` and `sync:pending` (count of outbox ops + photos not `done`) events; restarts automatically on app open
- [ ] T031 [P] Implement `web/js/camera.js`: `start(videoEl)` with `getUserMedia({video:{facingMode:"environment"}})`, `captureJpeg(videoEl)` → Blob scaled to max side 1280px, quality 0.7 (draw video frame to canvas, no shutter delay), `setTorch(on)` only if `track.getCapabilities().torch`, fallback `captureViaInput()` using `<input type="file" accept="image/*" capture="environment">` when permission denied
- [ ] T032 [P] Implement `web/js/scanner.js`: `startScan(videoEl, onText)` using `BarcodeDetector({formats:["qr_code"]})` when available, else jsQR on downscaled canvas frames every 150 ms; ignore same text within 2 s
- [ ] T033 Implement `web/js/app.js`: generate/persist `deviceId`, register `sw.js`, login screen (staff name + numeric PIN keypad) calling `login` and storing token/staff/qrSecret in `meta`, hash router (open `meta.lastMode` = last gate screen used on this device, initially `#checkin`; `#checkout`, `#lot`, `#shift`, `#print`, `#admin`, `#alerts`), hide manager routes for `role = staff`, header shows "Trong bãi: N" (by vehicle type) and "Chờ sao lưu: N" from `sync:pending`; store `clockOffset = serverTime − Date.now()` at login and expose `now()` used for every `inAt`/`outAt`/`createdAt`; unlock WebAudio on the first tap after login (needed for alert sounds on iPhone)
- [ ] T034 Create `tests/e2e/fixtures/mock-api.js`: Playwright `page.route(API_URL)` handler implementing contract actions (`login`, `push`, `pull`, `uploadPhoto`, `getPhoto`, `createBatch`, `report`, `resolveAlert`) in memory by calling `applyPush` from `web/shared/server-ops.js` (exactly the same logic as Apps Script) plus `web/shared/*`, with helpers to seed a batch 1–200 for today and to inject photo analyses

**Checkpoint**: Foundation ready — login works, data stored locally, sync loop runs against mock API

---

## Phase 3: User Story 1 - Gửi xe: số tự nhảy + chụp ảnh xe (Priority: P1) 🎯 MVP

**Goal**: Nhân viên gửi xe bằng 1 chạm (chụp ảnh); số phiếu tự nhảy, sửa được, offline vẫn chạy.

**Independent Test**: Từ số 001 chụp 5 xe → lượt 001–005; sửa số thành 009, chụp → lượt 009, đề xuất 010.

### Tests for User Story 1 ⚠️

- [ ] T035 [P] [US1] E2E test `tests/e2e/checkin.spec.js` covering spec US1 scenarios 1–7: first suggestion 001; capture creates session and suggests next; edit to 009 → saved 009, suggests 010, 006–008 reported skipped; editing to an in-lot number shows "Phiếu 003 đang có xe trong bãi" and blocks capture; after 200 shows "Đã hết phiếu hôm nay"; "Hoàn tác" within 10 s cancels and restores suggestion; `context.setOffline(true)` still allows check-in and queue is pushed after going online; assert each capture completes < 5 s (SC-001)

### Implementation for User Story 1

- [ ] T036 [US1] Implement `createSession` rule in `web/shared/server-ops.js` (with cases in `tests/unit/server-ops.test.js`), used by `gas/Sessions.js`: validate with `validateForCheckin` (today's date, not in use/used); a number beyond all of the day's `TicketBatches` is accepted but marked `conflict: "out_of_range"`; if another `in_lot` session has same (`ticketDate`,`ticketNo`) keep the earlier one and mark the new one `conflict: "duplicate_ticket"`; set `priceAtIn` via `priceFor`, `status = in_lot`, `plateStatus = pending`; audit `create`
- [ ] T037 [US1] Implement `undo` rule in `web/shared/server-ops.js` (with cases in `tests/unit/server-ops.test.js`): allowed only for same `inStaffId` and ≤ 10 s between `inAt` and op `createdAt` → `status = cancelled`, note "Hoàn tác"; audit `undo`
- [ ] T038 [US1] Implement `web/js/screens/checkin.js`: huge suggested number (from `suggestNext` using `meta.nextTicketNo:<today>` and local `in_lot` set), tap number → numeric keypad to edit, "Quét phiếu" icon sets number from QR (`parseQr`), live camera preview with framing overlay "Biển số + chỗ treo mũ", vehicle-type toggle (default `motorbike`), torch button, big "CHỤP" button
- [ ] T039 [US1] On "CHỤP" in `web/js/screens/checkin.js`: validate locally (`validateForCheckin`; `TICKET_OUT_OF_RANGE` shows a small warning but does not block) → `captureJpeg` → `db.saveCheckin(session, photo{kind:"in", uploadState:"pending"}, op createSession)` in one transaction → set next suggestion N+1 → show 10 s toast with "Hoàn tác" (enqueues `undo` op and restores suggestion) and "Chụp lại" (captures a new `in` photo replacing the previous one for the same session, keeps the ticket number); never awaits network
- [ ] T040 [US1] Add "Gửi xe không phiếu" in `web/js/screens/checkin.js`: `noTicket = true`, displays the number at ≥ 120px for hand-writing, still requires photo
- [ ] T041 [US1] Add ticket-stock banner in `web/js/screens/checkin.js`: "Còn N phiếu" (N from `remainingTickets`) with warning style when N < 20, and "Đã hết phiếu hôm nay" + hint to create more when suggestion exceeds max `toNo`

**Checkpoint**: User Story 1 fully functional and testable independently (MVP gửi xe)

---

## Phase 4: User Story 2 - Trả xe: quét mã hoặc nhập số + chụp xe lúc ra (Priority: P1)

**Goal**: Trả xe bằng quét QR hoặc gõ số, xem ảnh lúc vào, 1 chạm "Trả xe" tự chụp ảnh lúc ra.

**Independent Test**: Gửi 5 xe, trả 5 xe (3 quét, 2 gõ số) → bãi về 0, mỗi lượt có ảnh vào và ảnh ra.

### Tests for User Story 2 ⚠️

- [ ] T042 [P] [US2] E2E test `tests/e2e/checkout.spec.js` covering spec US2 scenarios 1–7: scan and typed number ("37") find the same session; multiple matches (yesterday 037 + today 037) show chooser with photos and dates; "Trả xe" stores an out photo and closes the session; re-scan returned ticket shows "Phiếu đã trả xe lúc HH:MM"; unused ticket shows "Phiếu này chưa gửi xe nào"; "Không khớp" does not check out; detail screen shows in/out photos side by side; assert checkout < 8 s (SC-008)

### Implementation for User Story 2

- [ ] T043 [US2] Implement `checkout` and `provisionalCheckout` rules in `web/shared/server-ops.js` (with cases in `tests/unit/server-ops.test.js`), used by `gas/Sessions.js`: `checkout` requires `in_lot` (already returned → `conflict: "double_checkout"`), sets `outAt`, `outStaffId`, `outPhotoId`, `fee = priceAtIn`; `provisionalCheckout` stores `status = provisional` with required `note`, and `createSession` for the same ticket later merges into it → `returned`; audit both
- [ ] T044 [US2] Implement `web/js/screens/checkout.js` lookup: scanner always on + numeric keypad (no leading zeros needed); search local sessions (`in_lot` first, then all for messages) by (`ticketDate`,`ticketNo`) from QR or by `ticketNo` from keypad; chooser when > 1 match; exact messages "Phiếu đã trả xe lúc HH:MM", "Phiếu này chưa gửi xe nào"; unknown-but-valid ticket while unsynced → "Chưa có dữ liệu phiếu này, chờ đồng bộ" with "Trả xe tạm" (requires note)
- [ ] T045 [US2] Implement `web/js/screens/checkout.js` confirm view: top half entry photo (large, tap to zoom), bottom half live camera, line with ticket no, plate (if any), vehicle type, in time, fee; "TRẢ XE" captures out photo in the same tap, updates local session to `returned`, enqueues `checkout` op and photo; "Không khớp" routes to `#lot?mode=lost&session=<id>`
- [ ] T046 [US2] Implement `web/js/screens/session-detail.js`: entry and exit photos side by side with pinch/tap zoom, in/out times, staff names, fee, status, audit trail (FR-009c)

**Checkpoint**: User Stories 1 AND 2 work → app thay được sổ giữ xe

---

## Phase 5: User Story 3 - Tạo và in phiếu QR mỗi ngày (Priority: P1)

**Goal**: Quản lý tạo bộ phiếu (mặc định 200) và in A4 bằng máy in sẵn có.

**Independent Test**: Tạo 200 phiếu cho ngày mai → 9 trang A4, phiếu 001–200, quét thử nhận đúng ngày/số.

### Tests for User Story 3 ⚠️

- [ ] T047 [P] [US3] Unit test `tests/unit/print-layout.test.js` for `paginate(tickets, 24)`: 200 tickets → 9 pages, each page consecutive numbers, last page 8 tickets; creating 50 more after 200 starts at 201

### Implementation for User Story 3

- [ ] T048 [US3] Implement `web/js/screens/print.js` (manager only): form date (default tomorrow) + count (default 200), buttons "Tạo phiếu" and "Tạo thêm", calls `createBatch`, then renders A4 pages 3 columns × 8 rows; each ticket shows QR (qrcode-generator, error correction M), number ≥ 48pt, date dd/mm/yyyy, "Gò Mây Arena", dashed cut lines; "In" calls `window.print()`
- [ ] T049 [P] [US3] Create `web/css/print.css` with `@page { size: A4; margin: 8mm }`, page breaks per 24 tickets, hide app chrome in print
- [ ] T050 [US3] Show "Phiếu của ngày khác" for old-date tickets scanned in `web/js/screens/checkin.js`, and show batches list (date, range, printed by) in `web/js/screens/print.js`

**Checkpoint**: All P1 stories done — app dùng thật được (MVP đầy đủ)

---

## Phase 6: User Story 4 - Mất phiếu và tìm xe bằng ảnh (Priority: P2)

**Goal**: Tìm xe theo lưới ảnh/biển số, trả xe mất phiếu với ghi chú bắt buộc, thu 10.000đ.

**Independent Test**: Gửi 3 xe, chọn 1 xe trong lưới ảnh, trả mất phiếu → trạng thái `lost`, ghi chú, 10.000đ.

### Tests for User Story 4 ⚠️

- [ ] T051 [P] [US4] E2E test `tests/e2e/lost-ticket.spec.js`: grid shows all in-lot photos newest first; "Mất phiếu" without note blocked; with note → fee 10000, status lost; later scanning that ticket shows "Phiếu đã báo mất, xe đã trả lúc HH:MM"; reassign ticket number on a session

### Implementation for User Story 4

- [ ] T052 [US4] Implement `lostCheckout` and `reassignTicket` rules in `web/shared/server-ops.js` (with cases in `tests/unit/server-ops.test.js`) (`note` required → else `NOTE_REQUIRED`; `fee = lostFee`; reassigned number must not collide with another `in_lot` session); audit `lost` / `reassign`
- [ ] T053 [US4] Implement `web/js/screens/lot.js`: grid of in-lot photos (ticket no, in time) sorted by `inAt` desc, search box filtering by partial plate or ticket no, tap → `session-detail`
- [ ] T054 [US4] Add actions in `web/js/screens/lot.js`: "Trả xe – mất phiếu" (mandatory note, shows lostFee, captures out photo, enqueues `lostCheckout`) and "Gán lại số phiếu" (numeric input + note, enqueues `reassignTicket`)

**Checkpoint**: Xử lý được mất phiếu và đưa nhầm phiếu

---

## Phase 7: User Story 5 - Chốt ca và xem doanh thu (Priority: P2)

**Goal**: Chốt ca cuối buổi; chủ sân xem báo cáo ngày/tuần/tháng từ xa.

**Independent Test**: 10 lượt (1 mất phiếu) → chốt ca tổng 55.000đ.

### Tests for User Story 5 ⚠️

- [ ] T055 [P] [US5] Unit test `tests/unit/report.test.js`: 9 returned × 5000 + 1 lost × 10000 = 55000; counts by vehicle type; overnight (`tồn qua đêm`) flag; skipped numbers; provisional and conflict counts; alerts total / unresolved

### Implementation for User Story 5

- [ ] T056 [US5] Implement `web/shared/report.js` `summarize({sessions, alerts, batches, from, to})` → `{count, revenue, byType, lost, provisional, conflicts, inLot, overnight, ticketsPrinted, ticketsUsed, skipped, alerts, alertsOpen}`; revenue counted on checkout time; add to `scripts/build-gas.mjs` order
- [ ] T057 [US5] Implement `closeShift` op and `report`, `setPrices` actions in `gas/Sessions.js` / `gas/Admin.js` (report `groupBy` day|shift, manager only; setPrices appends a new `Prices` row, never edits old rows, audit `set_price`)
- [ ] T058 [US5] Implement `web/js/screens/shift.js`: "Chốt ca" shows summary (from local data, then server-confirmed), list of remaining in-lot cars with photos
- [ ] T059 [US5] Implement `web/js/screens/admin.js` (manager): report by day/week/month with per-shift and staff breakdown, price settings form, staff list (add, reset PIN, deactivate), conflicts list, cancel session with mandatory note (`cancel` op)

**Checkpoint**: Chủ sân đối chiếu được tiền từ xa

---

## Phase 8: User Story 6 - Ảnh lưu máy, đọc biển số, sao lưu cloud chạy ngầm (Priority: P2)

**Goal**: Ảnh lên Drive chạy ngầm, xem lại được khi máy mất ảnh; biển số tự đọc.

**Independent Test**: Offline gửi 10 xe → online, "Chờ sao lưu" về 0, ảnh có trong Drive; máy mới xem được ảnh.

### Tests for User Story 6 ⚠️

- [ ] T060 [P] [US6] E2E test `tests/e2e/offline-sync.spec.js`: offline 10 check-ins show photos immediately and "Chờ sao lưu: 10"; online → counter reaches 0 and mock received 10 `uploadPhoto`; reload with cleared IndexedDB photos → photos load via `getPhoto`; plate injected by mock appears and is searchable by "345"; photos not `done` are never deleted by cleanup

### Implementation for User Story 6

- [ ] T061 [US6] Implement `gas/Photos.js`: `uploadPhoto` saves JPEG to `GoMay-GiuXe/Anh/YYYY-MM-DD/<ticketNo>_<kind>_<id>.jpg`, idempotent by `photoId`, writes `Photos` row inside a short `withLock`, then calls `analyzePhoto` **outside the lock** and writes results in a second short lock (errors swallowed → `analysisStatus = failed`); `getPhoto` returns base64 by `photoId`
- [ ] T062 [US6] Implement `getPhotoBlob(photoId)` in `web/js/db.js`: return local `blob` if present, else call `getPhoto` (cloud), store the blob back with `uploadState = done`, and return it; use it in `web/js/screens/session-detail.js`, `web/js/screens/checkout.js`, `web/js/screens/lot.js`, `web/js/screens/alerts.js` (FR-024)
- [ ] T063 [US6] Implement photo uploader in `web/js/sync.js`: one photo at a time, **`kind = out` photos first** (alerts ≤ 15 s, SC-012) then oldest `in` photos, `uploadState` pending → uploading → done/failed, retry with backoff, resume on app open; register Background Sync tag `photos` when supported (Android bonus only)
- [ ] T064 [US6] Implement `gas/Vision.js` `analyzePhoto(photoRow, blob)`: provider from ScriptProperty `VISION_PROVIDER` (`gemini` default, `claude`), key `VISION_API_KEY`; prompt asks for strict JSON `{plate, color, vehicleType, helmetsOnVehicle, helmetsWorn, otherItems, confidence:{plate,color,helmets}}` with Vietnamese plate format and color groups from research.md R6; validate and store on `Photos`; for `kind = in` update session `plate`, `plateStatus`, `inSummary` (e.g. "Xe máy màu đỏ · 2 mũ"); `retryFailedAnalyses()` trigger re-runs `failed`/`pending` rows older than 2 min
- [ ] T065 [US6] Add plate features: search by partial plate in `web/js/screens/lot.js`; small non-blocking "Biển số này đã có trong bãi (phiếu NNN)" notice in `web/js/screens/checkin.js` when a pulled plate duplicates another in-lot session; `setPlate` rule in `web/shared/server-ops.js` + edit field in `web/js/screens/session-detail.js`
- [ ] T066 [US6] Implement local cleanup in `web/js/db.js`: daily remove `blob` of photos with `uploadState = done` and `takenAt` older than 7 days; never touch others; warn in header when `navigator.storage.estimate()` usage > 80%
- [ ] T067 [US6] Implement `gas/Cleanup.js` `nightlyCleanup()`: trash Drive photo folders older than 30 days, move `Sessions`/`Photos`/`Audit` rows older than 90 days to a yearly archive spreadsheet

**Checkpoint**: Ảnh an toàn trên cloud, biển số tự điền

---

## Phase 9: User Story 7 - AI phân tích màu xe, số mũ và cảnh báo không khớp (Priority: P2)

**Goal**: So sánh ảnh vào/ra; cảnh báo khác màu/biển (cao) hoặc thiếu mũ (trung bình), không chặn thao tác.

**Independent Test**: Xe đỏ 2 mũ, ra còn 1 mũ → ≤ 15 giây cảnh báo; xe không đổi → không cảnh báo.

### Tests for User Story 7 ⚠️

- [ ] T068 [P] [US7] Unit test `tests/unit/compare.test.js`: color group differs with both confidences ≥ 0.7 → `color_mismatch` high; plates differ > 1 char → `plate_mismatch` high; out (onVehicle + worn) < in → `helmet_missing` medium; in 1 on vehicle / out 0 on vehicle + 1 worn → no alert; more helmets at exit → no alert; any confidence < threshold → no alert ("không đủ rõ để so sánh")
- [ ] T069 [P] [US7] E2E test `tests/e2e/alerts.spec.js`: mock injects analyses; checkout screen shows "Xe máy màu đỏ · 2 mũ"; after checkout an alert card appears within 15 s of the analysis becoming available (SC-012) with both photos (vibrate called when supported; with `navigator.vibrate` undefined the full-screen red flash is shown), next checkout is not blocked; resolving with "có vấn đề thật" closes it and shift summary counts it

### Implementation for User Story 7

- [ ] T070 [US7] Create accuracy evaluation: `tests/fixtures/vision/labels.json` (≈ 50 real lot photos, day and night, with true plate, color group, helmetsOnVehicle, helmetsWorn, and in/out pairs) and `scripts/eval-vision.mjs` calling the same prompt as `gas/Vision.js` and reporting plate accuracy (SC-009 ≥ 80%), color-mismatch detection (SC-013 ≥ 90%), helmet-missing detection (SC-013 ≥ 80%) and false-alarm rate (SC-014 ≤ 5%); tune prompt and default threshold until targets pass
- [ ] T071 [US7] Implement `web/shared/compare.js` `compareAnalyses(inA, outA, threshold)` → list of `{kind, level, message, inValue, outValue}` with color groups (đỏ, xanh dương, xanh lá, đen, trắng, xám/bạc, vàng, cam, nâu, hồng/tím) and messages like "Phiếu 037: lúc vào 2 mũ, lúc ra 1 mũ"; add to `scripts/build-gas.mjs`
- [ ] T072 [US7] Implement `gas/Alerts.js`: after an `out` photo analysis completes, run `compareAnalyses` with `Config.alertThreshold`, append `Alerts` rows (max one per session per `kind`, `notifyStaffId = outStaffId`, `status = new`), bump rev; actions (each audited: `resolve_alert`, `set_analysis`, `set_config`) `resolveAlert` (resolution `ok_customer_wearing | false_alarm | real_issue`), `listAlerts`, `setConfig` (alertThreshold 0.5–0.95), `setAnalysis` (manager, `analysisStatus = manual`, re-run compare); include `analyses` and new `alerts` in `pull`
- [ ] T073 [US7] Implement `web/js/screens/alerts.js`: overlay card for new alerts with `notifyStaffId` = me — `navigator.vibrate([300,100,300])` when supported, otherwise (iPhone) full-screen red flash for 1.5 s, short WebAudio beep (audio unlocked at login), red for high / orange for medium, in/out photos side by side, buttons "Đúng xe / khách đội mũ", "Báo sai", "Có vấn đề thật" + optional note; dismissible without blocking other screens; list view of open alerts
- [ ] T074 [US7] Show `inSummary` line in `web/js/screens/checkout.js` confirm view when available (no waiting); show analysis values and manager edit form in `web/js/screens/session-detail.js`; add alert sensitivity slider and alert list to `web/js/screens/admin.js`

**Checkpoint**: Tất cả user story hoạt động

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T075 [P] Write `README.md` (Vietnamese): what the app does, setup steps from quickstart.md A–C, how to run tests
- [ ] T076 [P] Write `docs/huong-dan-nhan-vien.md`: add to home screen on iPhone/Android, allow camera, framing (biển số + mũ) at entry and exit, fixing ticket number, lost ticket, handling alerts politely
- [ ] T077 [P] Add `.github/workflows/pages.yml` deploying `web/` to GitHub Pages on push to `main`
- [ ] T078 Bump `sw.js` cache version automatically in `scripts/build-gas.mjs` or a `scripts/bump-sw.mjs` so phones get updates
- [ ] T079 Security pass: confirm all 🔴 actions reject staff tokens, tokens revocable from `web/js/screens/admin.js`, no PIN stored in plain text, `QR_SECRET` and `VISION_API_KEY` only in Script Properties
- [ ] T080 Run all tests (`npm test`, `npm run test:e2e`) and fix failures
- [ ] T081 Run quickstart.md section E field test (20 scenarios) on real phones for one evening and record results in `specs/001-giu-xe-go-may/checklists/field-test.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **US1 (Phase 3)**: After Foundational. MVP.
- **US2 (Phase 4)**: After Foundational; uses sessions created by US1 (test seeds them via mock if run alone)
- **US3 (Phase 5)**: After Foundational (`createBatch` data exists from T022); independent of US1/US2 UI
- **US4 (Phase 6)**: After US2 (reuses checkout photo capture and session-detail)
- **US5 (Phase 7)**: After Foundational; meaningful after US1 + US2
- **US6 (Phase 8)**: After US1 (photos exist); US6 uploader is required before US7
- **US7 (Phase 9)**: After US6 (needs analyses) and US2 (needs out photos)
- **Polish (Phase 10)**: After desired stories

### Within Each User Story

- Tests written and FAILING before implementation
- `web/shared/` logic → `gas/` handlers → `web/js/screens/` UI
- Run `npm run build:gas` after any change in `web/shared/`

### Parallel Opportunities

- Phase 1: T003–T007 in parallel
- Phase 2: T009–T011 (tests) together; T012–T014 together; T023–T027, T029, T031, T032 together
- After Phase 2: US3 (print) can be built in parallel with US1/US2; US5 report logic (T055, T056) in parallel with US4
- All test tasks marked [P] within a story run in parallel

---

## Parallel Example: Foundational

```bash
Task: "Unit tests in tests/unit/ticket.test.js"
Task: "Unit tests in tests/unit/pricing.test.js"
Task: "Unit tests in tests/unit/sessions.test.js"
# then
Task: "Implement web/shared/ticket.js"
Task: "Implement web/shared/pricing.js"
Task: "Implement web/shared/sessions.js"
```

## Parallel Example: User Story 1 + User Story 3

```bash
Task: "E2E test tests/e2e/checkin.spec.js"
Task: "Unit test tests/unit/print-layout.test.js"
Task: "Implement web/js/screens/print.js"
```

---

## Implementation Strategy

### MVP First

1. Phase 1 + Phase 2
2. Phase 3 (US1 gửi xe) → STOP, test với mock
3. Phase 4 (US2 trả xe) + Phase 5 (US3 in phiếu) → **MVP dùng thật được**: in phiếu, gửi xe, trả xe có ảnh vào/ra
4. Triển khai Apps Script + GitHub Pages, chạy thử 1 buổi tối (quickstart E, kịch bản 1–8, 14)

### Incremental Delivery

1. MVP (US1–US3) → dùng thật
2. + US4 mất phiếu, + US5 chốt ca/báo cáo → kiểm soát tiền
3. + US6 sao lưu ngầm + biển số → an toàn dữ liệu
4. + US7 cảnh báo AI → chống nhầm xe, mất mũ
5. Mỗi bước chạy lại toàn bộ test để không làm hỏng phần trước

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Không thao tác nào ở cổng được `await` mạng (constitution Nguyên tắc I, II)
- Không xóa lượt gửi, chỉ đổi trạng thái (Nguyên tắc IV)
- Commit after each task or logical group
