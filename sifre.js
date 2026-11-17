// MegscriptVM şifre sıfırlama sayfası: e-posta iste -> bağlantı gelir (/sifre#t=...) -> yeni şifre.
"use strict";
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

function adim(a) {
  $$(".giris-adim").forEach((s) => (s.hidden = s.dataset.adim !== a));
  const g = $(`.giris-adim[data-adim="${a}"] input:not([hidden])`);
  if (g && matchMedia("(pointer:fine)").matches) setTimeout(() => g.focus(), 120);
}
function mesgul(d, metin) {
  const s = d.querySelector("span");
  if (!d.dataset.asil) d.dataset.asil = s.textContent;
  d.disabled = !!metin;
  s.textContent = metin || d.dataset.asil;
}
function hataYaz(kutu, m) { kutu.textContent = m || ""; kutu.hidden = !m; }

async function gonder(yol, veri) {
  let r;
  try {
    r = await fetch(yol, {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "X-MscriptVM": "1" },
      body: new URLSearchParams(veri).toString(),
    });
  } catch (e) { throw new Error("Sunucuya ulaşılamadı: internet bağlantını kontrol et."); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const h = new Error(j.hata || `Hata (${r.status})`); h.veri = j; throw h; }
  return j;
}

// adres çubuğundaki #t=... (bağlantı jetonu) ya da #e=... (giriş sayfasından gelen e-posta)
const parca = new URLSearchParams(location.hash.slice(1));
const jeton = parca.get("t");
if (jeton) {
  history.replaceState(null, "", location.pathname);      // jeton adres çubuğunda ve geçmişte kalmasın
  adim("yeni");
} else {
  if (parca.get("e")) $("#isteForm").eposta.value = parca.get("e");
  adim("iste");
}

let sonEposta = "";
async function iste(e) {
  const d = $("#isteDugme"), h = $("#isteHata"), g = $("#isteForm").eposta;
  hataYaz(h, "");
  g.classList.remove("hatali");
  const v = (e || g.value).trim();
  if (!/^\S+@\S+\.\S+$/.test(v)) { g.classList.add("hatali"); g.focus(); return hataYaz(h, "Geçerli bir e-posta adresi yaz."); }
  mesgul(d, "Gönderiliyor…");
  try {
    await gonder("/api/sifre/unuttum", { eposta: v });
    sonEposta = v;
    $("#gonderilenEposta").textContent = v;
    adim("gonderildi");
  } catch (er) { adim("iste"); hataYaz(h, er.message); }
  finally { mesgul(d, ""); }
}
$("#isteForm").addEventListener("submit", (e) => { e.preventDefault(); iste(); });

let bekleme = null;
$("#yenidenGonder").addEventListener("click", async () => {
  const d = $("#yenidenGonder");
  await iste(sonEposta);
  let kalan = 60;
  d.disabled = true;
  clearInterval(bekleme);
  bekleme = setInterval(() => {
    d.querySelector("span").textContent = --kalan > 0 ? `Yeniden gönder (${kalan} sn)` : "Yeniden gönder";
    if (kalan <= 0) { clearInterval(bekleme); d.disabled = false; }
  }, 1000);
});

function sifreGucu(s) {
  if (!s) return 0;
  if (s.length < 8) return 1;
  let p = 0;
  if (s.length >= 12) p++;
  if (/[a-zçğıöşü]/.test(s) && /[A-ZÇĞİÖŞÜ]/.test(s)) p++;
  if (/\d/.test(s)) p++;
  if (/[^A-Za-z0-9çğıöşüÇĞİÖŞÜ]/.test(s)) p++;
  return Math.min(4, Math.max(2, p + 1));
}
const GUC_METNI = ["Harf, rakam ve sembol karıştır.", "Zayıf: en az 8 karakter olmalı", "Orta: biraz daha uzat", "İyi şifre", "Çok güçlü"];
$("#yeniForm").sifre.addEventListener("input", (e) => {
  const g = sifreGucu(e.target.value), k = $("#sifreGuc");
  k.dataset.seviye = g;
  k.querySelector("small").textContent = GUC_METNI[g];
});
document.addEventListener("click", (e) => {
  const goz = e.target.closest("[data-goz]");
  if (!goz) return;
  const i = goz.parentElement.querySelector("input");
  const ac = i.type === "password";
  i.type = ac ? "text" : "password";
  goz.classList.toggle("acik", ac);
  goz.setAttribute("aria-label", ac ? "Şifreyi gizle" : "Şifreyi göster");
});

$("#yeniForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target, d = $("#yeniDugme"), h = $("#yeniHata");
  hataYaz(h, "");
  $$("#yeniForm .hatali").forEach((x) => x.classList.remove("hatali"));
  if (f.sifre.value.length < 8) { f.sifre.classList.add("hatali"); f.sifre.focus(); return hataYaz(h, "Şifre en az 8 karakter olmalı."); }
  if (f.sifre.value !== f.sifre2.value) { f.sifre2.classList.add("hatali"); f.sifre2.focus(); return hataYaz(h, "İki şifre aynı değil."); }
  mesgul(d, "Kaydediliyor…");
  try {
    await gonder("/api/sifre/sifirla", { jeton, sifre: f.sifre.value });
    f.reset();
    adim("bitti");
    setTimeout(() => location.assign("/"), 2500);
  } catch (er) {
    hataYaz(h, er.message);
    if (er.veri && er.veri.yeni_baglanti) $("#yeniBaglanti").hidden = false;
  } finally { mesgul(d, ""); }
});
