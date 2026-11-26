# The Beaver

หน้าร้านงานภาพจาก Stitch รุ่น undo. รอบนี้เปิดให้ตัดสติกเกอร์ภาพนิ่ง LINE จากแผ่นกริด 4 × 4 เท่านั้น ภาพช่องแรกใช้เป็นค่าเริ่มต้นของ main และ tab ซึ่งเปลี่ยนได้จากหน้าถาดผลงาน

## เปิดในเครื่อง

ต้องมี Node.js 22+ และ checkout ของ ygg-beaver ที่มี commit 4177d8eb4aa4109fecba39ab3a37c81c93412241

```sh
BEAVER_ENGINE_REPO='/path/to/ygg-beaver' node server.mjs
```

เปิด http://127.0.0.1:4178 เลือกภาพหรือกดใช้ภาพตัวอย่าง ตรวจ 18 ช่อง (16 สติกเกอร์, main และ tab) และกดแพ็กงาน ระบบส่ง ZIP ที่รวม PNG เท่านั้น

เซิร์ฟเวอร์ในเครื่องโหลดโมดูล Beaver จาก Git revision ที่ระบุ ฝั่งหน้าเว็บส่งเฉพาะ PNG ไปที่ `/api/images/cut` หรือถาด PNG ไปที่ `/api/images/zip` รูปที่ส่งถูกประมวลผลในหน่วยความจำและตอบกลับในรอบเดียว สะพานไม่ต้องใช้บัญชีหรือสิทธิ์ Beaver เจ้าของ

สำหรับบัญชีสำรองหรือ OpenAI reviewer ต้องมีการติดตั้งแยกสำหรับเดโมที่มีการยืนยันตัวตนและจำกัดการใช้งานก่อนเปิดผ่านเครือข่าย เซิร์ฟเวอร์นี้รับเฉพาะ localhost และไม่มี MCP endpoint

## เดโมส่วนตัวผ่าน ChatGPT — ยังไม่เปิดออนไลน์

นี่เป็นบริการแยก ไม่แก้ Worker โรงงาน ไม่สร้างฐานข้อมูล ไม่ใช้ API แบบเสียเงิน และไม่เก็บภาพหรือ ZIP ฝั่งเซิร์ฟเวอร์หลังตอบกลับ แอปใน ChatGPT มีเครื่องมือเดียวคือเปิดหน้า Sticker Studio ส่วนอัปโหลดรูปและดาวน์โหลด ZIP ทำในหน้าเว็บที่ยืนยันตัวตนแล้ว (ไม่แนบภาพหรือส่งโทเคนผ่านแชต)

ก่อนเปิดเดโม:
1. ใช้โฮสต์ Node.js 22+ ที่แยกจาก production และใช้ HTTPS ผ่าน Cloudflare; Node ฟัง loopback เป็นค่าเริ่มต้น ส่ง original Host header มาที่ origin และอย่าเปิด origin ออกอินเทอร์เน็ต
2. สร้าง Cloudflare Access application แยกสองตัว: โฮสต์เว็บ (self-hosted, login) และโฮสต์ MCP ที่ path `/mcp` (Managed OAuth) อนุญาตเฉพาะอีเมลบัญชีทดสอบที่เจ้าของยืนยัน ไม่แก้ policy โรงงานเดิม ตั้ง redirect URI จากหน้าสร้างแอป ChatGPT ให้ตรงตามที่แสดง ไม่ใช้ wildcard [คู่มือ Cloudflare](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/).
3. ติดตั้งด้วย `npm ci`; mount checkout `ygg-beaver` แบบ read-only ที่มี revision ที่ระบุข้างต้น ใช้ engine สามโมดูลจาก revision เดิม ห้ามใช้ credential โรงงานใน runtime ตั้งค่าผ่าน environment (ไม่ commit หรือส่ง secret):
   - `BEAVER_ENGINE_REPO` — checkout ของ engine
   - `BEAVER_WEB_ORIGIN`, `BEAVER_MCP_ORIGIN` — HTTPS สองโฮสต์ที่ไม่ซ้ำกัน
   - `BEAVER_ACCESS_ISSUER` — HTTPS ของทีม Cloudflare Access
   - `BEAVER_ACCESS_AUD` และ `BEAVER_MCP_ACCESS_AUD` — audience จาก Access app ของเว็บและ MCP ตามลำดับ ต้องไม่ซ้ำ
   - `BEAVER_ALLOWED_EMAIL` — อีเมลเดียวที่ยืนยันแล้ว; `PORT` เป็นตัวเลือก
4. สั่ง `npm start` จาก checkout นี้; ในบัญชีทดสอบเชื่อม `BEAVER_MCP_ORIGIN/mcp` แบบ OAuth โดยใช้ metadata ที่ Cloudflare ให้ ไม่ติดตั้งแอปรวมของโรงงานหรือส่ง token ให้บัญชีทดสอบ
5. ตรวจรับหนึ่งรอบ: บัญชีสำรองพบเพียง `open_sticker_studio`, เปิดหน้า, ใช้ภาพตัวอย่าง, เปิด ZIP ที่มี 01–16 + main/tab และบัญชีอื่นไม่ผ่าน Access นอกขอบเขตงานนี้: แต่งธีม LINE, เปิดขาย, ให้บุคคลทั่วไปสมัคร หรือปรับสิทธิ์โรงงาน

หลักฐานในเครื่อง: `BEAVER_TEST_ENGINE_DIR=/path/to/pinned-checkout npm test` ใช้ JWT fixture และโมดูล engine จริง ตรวจว่าไม่มีสิทธิ์เมื่อไม่ได้ลงชื่อ/เป็นคนละอีเมล/ใช้ JWT จากคนละ Access app จากนั้นเรียก MCP และ PNG → ZIP ผ่าน HTTP. ไม่ใช่หลักฐาน OAuth จริงกับ ChatGPT หรือ Cloudflare.
