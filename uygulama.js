// MegscriptVM konsolu — arayüz mantığı. Arka uç: uygulamalar/megscriptvm/konsol.mgs.
// Dış kütüphane yok; grafikler ve çizimler burada SVG olarak üretilir.
"use strict";

const KADEMELER = [
  { n: 1, sinif: "Nano-Node", gpu: "Abyss-Vcore", cpu: "Kıvılcım-1", vcpu: "1–2 vCPU", ram: "2 GB", vram: "512 MB", guc: "1x", isci: "1 işçi", simd: "SSE2 / NEON", rol: "Mikro API'ler, terminal servisleri, basit 2D mantık döngüleri." },
  { n: 2, sinif: "Pulse-Server", gpu: "Soul-Stream Matrix", cpu: "Ruh-Akışı R8", vcpu: "4–8 vCPU", ram: "8 GB", vram: "2 GB", guc: "3.5x", isci: "4–8 işçi", simd: "AVX2 / SSE4.2", rol: "100 oyunculu ilk canlı sunucu; M:N iş çalma, orta ölçekli lobiler." },
  { n: 3, sinif: "Vortex-Dedicated", gpu: "Vortex-Gpu Core", cpu: "Girdap-X16", vcpu: "16 vCPU", ram: "32 GB", vram: "8 GB", guc: "8x", isci: "16 işçi", simd: "AVX2 / AVX-512", rol: "Yüksek trafikli oyun sunucuları, sunucu taraflı görüntü işleme." },
  { n: 4, sinif: "Hyper-Cluster", gpu: "Kragar-V7 HyperCore", cpu: "Kragar-T64", vcpu: "32–64 vCPU", ram: "128 GB", vram: "24 GB", guc: "24x", isci: "64 işçi", simd: "AVX-512 / SVE", rol: "Açık dünya MMORPG bölgeleri, NUMA farkında zamanlayıcı.", arastirma: true },
  { n: 5, sinif: "Titan-Mainframe", gpu: "Aethel-X Titan Engine", cpu: "Aethel-X Sovereign", vcpu: "128+ vCPU", ram: "512+ GB", vram: "küme", guc: "75x+", isci: "küme", simd: "düğüm başına", rol: "Dağıtık küme, foton düzeyinde ışık işleri.", arastirma: true },
];
const IKON_KOD = '<path d="M8.5 8L4.5 12l4 4M15.5 8l4 4-4 4M13.5 5l-3 14"/>';
const SAYFA_AD = { genel: "Genel bakış", makineler: "Sunucular", defter: "Kod defteri", gunlukler: "Günlükler", donanim: "Donanım", planlar: "Planlar", hesabim: "Hesabım", guncellemeler: "Güncellemeler", blog: "Blog", yonetim: "Yönetim", "odeme-tamam": "Ödeme" };
const durumAd = { "çalışıyor": "Çalışıyor", "durdu": "Durdu", "hata": "Hata", "yeniden_başlıyor": "Yeniden başlıyor" };

let ozet = null, ornekler = [], filtre = "hepsi", gunlukAd = null, secilenKademe = 0, politika = "katı", bagli = false;
let duzenlenen = null;                // çekmece düzenleme kipindeyse makinenin adı
const DOSYADAN = location.protocol === "file:";   // index.html çift tıklanıp açıldıysa arka uç yoktur
// Bulut: sayfa Netlify'dan (kendi alan adından) açıldı. Giriş Google ile; /api/* Netlify fonksiyonundan geçer.
// Yerel: konsol.mgs'in kendi adresi (localhost:8090), giriş yok.
const BULUT = !DOSYADAN && !["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
let hesap = null, girisAcik = false, tazeleSayaci = null;
const bellekGecmisi = [];             // toplam bellek, 2 sn'de bir (son 3 dk)
const $ = (s, k = document) => k.querySelector(s);
const $$ = (s, k = document) => [...k.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------------------------------------------------------------- gizlilik
// Arka uç zaten gizler; burada ikinci kez: hiçbir IP adresi ya da kullanıcı klasörü ekrana çıkmaz.
function gizle(s) {
  return String(s ?? "")
    .replace(/\\/g, "/")
    .replace(/\/(home|users)\/[^/]+/gi, "/…")
    .replace(/(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w.])/g, "•••")
    .replace(/\[[0-9a-f:.%]*:[0-9a-f:.%]*\]/gi, "[•••]")
    .replace(/(?<![\w:])(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}(?![\w:])/gi, (m) => (/\d/.test(m) || m === "::" ? "•••" : m));
}

// ---------------------------------------------------------------- API
const ULASILAMADI = BULUT
  ? "Buluta ulaşılamadı: internet bağlantını kontrol et ve yeniden dene."
  : "Konsola ulaşılamadı: MegscriptVM konsolu kapalı. MegscriptVM.cmd ile başlat ve yeniden dene.";
async function istekAt(yol, ayar) {
  let r;
  try { r = await fetch(yol, { credentials: "same-origin", ...ayar }); } catch (e) { throw new Error(ULASILAMADI); }   // "Failed to fetch"
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && j.giris && BULUT) { girisGoster(); }       // oturum düştü
  if (!r.ok) {
    const h = new Error(j.hata || `Konsol hata verdi (${r.status}).`);
    h.motorYok = !!j.motor_yok;
    h.plan = !!j.plan;
    h.veri = j;
    h.giris = !!j.giris;
    throw h;
  }
  return j;
}
const al = (yol) => istekAt(yol, { cache: "no-store" });
const gonder = (yol, veri = {}) => istekAt(yol, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded", "X-MscriptVM": "1" },
  body: new URLSearchParams(veri).toString(),
});

// ---------------------------------------------------------------- biçim
const mb = (kb) => kb >= 1024 * 1024 ? (kb / 1024 / 1024).toFixed(1) + " GB" : kb >= 1024 ? (kb / 1024).toFixed(1) + " MB" : (kb || 0) + " KB";
function sure(sn) {
  if (!sn) return "—";
  const g = Math.floor(sn / 86400), s = Math.floor((sn % 86400) / 3600), d = Math.floor((sn % 3600) / 60);
  if (g) return `${g}g ${s}sa`;
  if (s) return `${s}sa ${d}dk`;
  if (d) return `${d}dk ${sn % 60}sn`;
  return `${sn}sn`;
}
const kademeKisa = (n) => (n ? `Tier ${n}` : "Otomatik");
const kademeAdi = (n) => (n ? `Tier ${n} · ${KADEMELER[n - 1].sinif}` : "Otomatik");
const kademeCubuk = (n) => `<div class="kademe-cubuk">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? "dolu" : ""}"></i>`).join("")}</div>`;
const makineAlt = (o) => o.not || "kendi kodun";

// Alan grafiği: çizgi + köz renginde yumuşak dolgu. Sabit en/boy oranı yok, kutusunu doldurur.
let grafikNo = 0;
function alanGrafik(dizi, sinif = "") {
  const W = 200, H = 48;
  if (!dizi || dizi.length < 2) {
    return `<svg class="alan-grafik ${sinif}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path class="bos-cizgi" d="M0 ${H - 6}H${W}"/></svg>`;
  }
  const id = "g" + ++grafikNo;
  const en = Math.max(...dizi), az = Math.min(...dizi) * 0.9, ar = Math.max(1, en - az);
  const n = dizi.length;
  const p = dizi.map((v, i) => [(i / (n - 1)) * W, H - 3 - ((v - az) / ar) * (H - 10)]);
  let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
  for (let i = 1; i < n; i++) {           // yumuşak eğri (orta nokta)
    const [x0, y0] = p[i - 1], [x1, y1] = p[i], mx = (x0 + x1) / 2;
    d += ` C${mx.toFixed(1)} ${y0.toFixed(1)} ${mx.toFixed(1)} ${y1.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return `<svg class="alan-grafik ${sinif}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--koz)" stop-opacity=".32"/><stop offset="1" stop-color="var(--koz)" stop-opacity="0"/></linearGradient></defs>
    <path class="dolgu" d="${d} L${W} ${H} L0 ${H} Z" fill="url(#${id})"/><path class="cizgi" d="${d}"/></svg>`;
}

// Boş durum çizimi: içi boş, kesik çizgili kule ve uçurum halkaları
const BOS_CIZIM = `<svg class="bos-cizim" viewBox="0 0 200 120" aria-hidden="true">
  <g fill="none" stroke="var(--koz)"><ellipse cx="100" cy="100" rx="88" ry="14" opacity=".15"/><ellipse cx="100" cy="100" rx="58" ry="9" opacity=".3" stroke-dasharray="3 5"/><ellipse cx="100" cy="100" rx="28" ry="4.5" opacity=".55"/></g>
  <g fill="none" stroke="var(--soluk)" stroke-width="1.4" stroke-dasharray="4 4" opacity=".8">
    <path d="M100 14 L136 32 L100 50 L64 32 Z"/><path d="M64 32 L64 72 L100 90 L100 50"/><path d="M136 32 L136 72 L100 90"/></g>
  <path d="M100 26 L112 32 L100 38 L88 32 Z" fill="none" stroke="var(--koz)" stroke-width="1.4"/></svg>`;

const ikon = {
  baslat: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10-6.5z"/></svg>',
  durdur: '<svg viewBox="0 0 24 24"><path d="M7 7h10v10H7z"/></svg>',
  yeniden: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7"/></svg>',
  gunluk: '<svg viewBox="0 0 24 24"><path d="M4 5h16v14H4zM7.5 9.5l3 2.5-3 2.5M12.5 15h4"/></svg>',
  sil: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 11v5M14 11v5"/></svg>',
  ok: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  duzenle: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/></svg>',
};

// ---------------------------------------------------------------- bildirim, onay
// Bildirim: ekranın üstünde ortada küçük hap; ~6 sn görünür, sonra yavaşça kaybolur. Üstüne gelince bekler.
const BILDIRIM_SURE = 6000;
function bildir(metin, iyi = true) {
  const kutu = $("#bildirimler");
  for (const eski of kutu.querySelectorAll(".bildirim")) if (eski.textContent === metin) eski.remove();   // aynısı üst üste yığılmaz
  const b = document.createElement("div");
  b.className = "bildirim " + (iyi ? "iyi" : "kotu");
  b.setAttribute("role", iyi ? "status" : "alert");
  b.textContent = metin;
  kutu.append(b);
  while (kutu.children.length > 3) kutu.firstElementChild.remove();
  let kalan = BILDIRIM_SURE, basla = Date.now(), sayac;
  const git = () => { b.classList.add("gidiyor"); setTimeout(() => b.remove(), 450); };
  const kur = () => { basla = Date.now(); sayac = setTimeout(git, kalan); };
  b.addEventListener("mouseenter", () => { clearTimeout(sayac); kalan -= Date.now() - basla; });
  b.addEventListener("mouseleave", () => { kalan = Math.max(kalan, 1500); kur(); });
  kur();
}
function onayla(baslik, metin) {
  return new Promise((coz) => {
    $("#onayBaslik").textContent = baslik;
    $("#onayMetin").textContent = metin;
    const m = $("#onayModal");
    m.hidden = false;
    const bitir = (e) => {
      const v = e.target.closest("[data-onay]");
      if (!v && e.target !== m) return;
      m.hidden = true;
      m.removeEventListener("click", bitir);
      coz(v && v.dataset.onay === "evet");
    };
    m.addEventListener("click", bitir);
  });
}

// ---------------------------------------------------------------- makine kartları
function eylemler(o, kucuk) {
  const ç = o.durum === "çalışıyor";
  return `<div class="eylemler">
    ${ç ? `<button data-is="durdur" title="Durdur" aria-label="Durdur">${ikon.durdur}</button><button data-is="yeniden" title="Yeniden başlat" aria-label="Yeniden başlat">${ikon.yeniden}</button>`
        : `<button class="yesil" data-is="baslat" title="Başlat" aria-label="Başlat">${ikon.baslat}</button>`}
    <button data-is="duzenle" title="Kod defterini aç" aria-label="Kod defterini aç">${ikon.duzenle}</button>
    <button data-is="gunluk" title="Günlük" aria-label="Günlük">${ikon.gunluk}</button>
    ${kucuk ? "" : `<button class="kirmizi" data-is="sil" title="Sil" aria-label="Sil">${ikon.sil}</button>`}
  </div>`;
}

// Oyuncuların bağlanacağı dış adres (playit.gg tüneli). Port yoksa satır çıkmaz; tünel hazırlanırken bekleme yazar.
const KURE_IKON = '<svg viewBox="0 0 24 24"><path d="M12 21a9 9 0 100-18 9 9 0 000 18zM3.5 9h17M3.5 15h17M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z"/></svg>';
function disAdresSatiri(o) {
  if (!o.port) return "";
  if (!o.dış_adres) return `<div class="dis-adres bekliyor">${KURE_IKON}<span>Dış adres hazırlanıyor…</span></div>`;
  return `<div class="dis-adres" title="Oyuncular sunucuna bu adresle bağlanır">${KURE_IKON}<span>Oyuncu adresi</span>
    <code>${esc(o.dış_adres)}</code><button type="button" class="kopyala" data-kopyala="${esc(o.dış_adres)}">Kopyala</button></div>`;
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-kopyala]");
  if (!b) return;
  try { await navigator.clipboard.writeText(b.dataset.kopyala); bildir("Adres kopyalandı"); }
  catch (er) { bildir("Kopyalanamadı; adresi elle seç", false); }
});

function makineKarti(o) {
  const ç = o.durum === "çalışıyor";
  return `<article class="makine ${esc(o.durum)}" data-ad="${esc(o.ad)}">
    <div class="makine-bas">
      <span class="makine-ikon"><svg viewBox="0 0 24 24">${IKON_KOD}</svg></span>
      <div class="makine-ad"><b>${esc(o.ad)}</b><small>${esc(makineAlt(o))}</small></div>
      <span class="durum ${esc(o.durum)}"><i></i>${durumAd[o.durum] || esc(o.durum)}</span>
    </div>
    <div class="makine-grafik"><span class="grafik-etiket">Bellek</span><span class="grafik-deger">${ç ? mb(o.bellek_kb) : "—"}</span>${alanGrafik(ç ? o.geçmiş : [])}</div>
    <dl class="makine-olcu">
      <div><dt>Kademe</dt><dd title="${esc(kademeAdi(o.kademe))}">${esc(kademeKisa(o.kademe))}</dd></div>
      <div><dt>Çalışma</dt><dd>${ç ? sure(o.süre_sn) : "—"}</dd></div>
      <div><dt>Port</dt><dd>${o.port || "—"}</dd></div>
      <div title="${ç ? "İşlemci: " + o.işlemci_sn.toFixed(1) + " sn" : ""}"><dt>Oyuncu</dt><dd>${ç && o.port && o.oyuncu !== undefined ? `${o.oyuncu}${o.oyuncu_tepe ? `<small> · tepe ${o.oyuncu_tepe}</small>` : ""}` : "—"}</dd></div>
    </dl>
    ${disAdresSatiri(o)}
    <div class="makine-alt">
      <label class="anahtar"><input type="checkbox" data-oto ${o.otomatik ? "checked" : ""}><span></span>Bekçi${o.toplam_yeniden ? ` <small>· ${o.toplam_yeniden}× kaldırdı</small>` : ""}</label>
      ${eylemler(o, false)}
    </div>
  </article>`;
}

function miniOge(o) {
  const ç = o.durum === "çalışıyor";
  return `<div class="mini-oge" data-ad="${esc(o.ad)}">
    <span class="durum ${esc(o.durum)}" title="${durumAd[o.durum] || esc(o.durum)}"><i></i></span>
    <div class="ad"><b>${esc(o.ad)}</b><small>${esc(makineAlt(o))}</small></div>
    ${alanGrafik(ç ? o.geçmiş : [])}
    <div class="sag">${ç ? mb(o.bellek_kb) : "durdu"}<small>${ç ? sure(o.süre_sn) : esc(kademeKisa(o.kademe))}</small></div>
  </div>`;
}

function bosDurum(kucuk) {
  return `<div class="bos-durum">${BOS_CIZIM}<b>Henüz sunucun yok</b>
    <p>${kucuk ? "İlk sunucunu kendi kodunla yaz." : "Bir ad ver, sonra kodunu sunucunun kod defterinde yaz."}</p>
    <button class="dugme birincil" data-ac="olustur"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>Yazmaya başla</button></div>`;
}

// ---------------------------------------------------------------- donanım çizimi
function cipCizimi(a) {
  const n = Math.max(1, Math.min(64, a.çekirdek | 0)), isci = Math.min(n, a.işçi | 0);
  const kol = Math.ceil(Math.sqrt(n)), sat = Math.ceil(n / kol);
  const dx = 56, dy = 50, dw = 148, dh = 120, ara = 6;
  const cw = (dw - ara * (kol - 1)) / kol, ch = (dh - ara * (sat - 1)) / sat;
  let ck = "";
  for (let i = 0; i < n; i++) {
    const x = dx + (i % kol) * (cw + ara), y = dy + Math.floor(i / kol) * (ch + ara);
    ck += `<rect class="cekirdek ${i < isci ? "isci" : ""}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cw.toFixed(1)}" height="${ch.toFixed(1)}" rx="3"/>`;
  }
  let pin = "";
  for (let i = 0; i < 10; i++) {
    const t = 48 + i * 18.4;
    pin += `<path class="pin" d="M${t} 26V14M${t} 226V238M30 ${t + 2}H18M230 ${t + 2}H242"/>`;
  }
  const ramGB = a.ram_mb / 1024, dilim = 8, dolu = Math.max(1, Math.min(dilim, Math.round((ramGB / 64) * dilim)));
  let ram = "";
  for (let i = 0; i < dilim; i++) ram += `<rect class="${i < dolu ? "ram-dolu" : "ram"}" x="${276 + i * 16.5}" y="70" width="12" height="18" rx="2"/>`;
  let kd = "";
  for (let i = 1; i <= 5; i++) {
    const h = 8 + i * 6;
    kd += `<rect x="${276 + (i - 1) * 22}" y="${226 - h}" width="16" height="${h}" rx="2" class="${i <= a.kademe ? "cekirdek isci" : "ram"}"/>`;
  }
  const islemci = esc(a.sanal_işlemci);
  return `<svg viewBox="0 0 420 250" role="img" aria-label="${n} çekirdekli işlemci çizimi">
    ${pin}
    <rect class="govde" x="30" y="26" width="200" height="200" rx="14"/>
    <rect class="ic" x="46" y="40" width="168" height="172" rx="9"/>
    ${ck}
    <text x="56" y="198">${islemci} · ${isci}/${n} işçi</text>
    <text x="276" y="56">RAM</text>
    <rect class="govde" x="270" y="62" width="140" height="34" rx="5"/>${ram}
    <path class="pin" d="M280 100v6M292 100v6M304 100v6M316 100v6M328 100v6M340 100v6M352 100v6M364 100v6M376 100v6M388 100v6M400 100v6" stroke-width="1.5"/>
    <text x="276" y="130" class="buyuk">${ramGB.toFixed(1)} GB</text>
    <text x="276" y="160">SIMD</text>
    <text x="276" y="178" class="buyuk">${esc(a.simd)}</text>
    ${kd}
    <text x="390" y="226" text-anchor="end" class="buyuk">T${a.kademe}</text>
  </svg>`;
}

// ---------------------------------------------------------------- çizim
function ozetCiz() {
  const k = $(".kahraman"), et = $("#kahramanEtiket");
  if (!ozet) return;
  const a = ozet.ana_makine;
  const islemci = a.işlemci.replace(/\s+/g, " ").replace(/\(R\)|\(TM\)|CPU /g, "").replace(/\s+@.*$/, "").trim();
  const çal = ozet.çalışan, top = ozet.toplam;

  // kahraman
  k.classList.toggle("canli", çal > 0);
  if (çal > 0) { et.className = "etiket"; et.innerHTML = "<i></i>bulut ayakta"; $("#kahramanBaslik").textContent = `${çal} sunucu çalışıyor.`; }
  else if (top > 0) { et.className = "etiket bos"; et.innerHTML = "<i></i>beklemede"; $("#kahramanBaslik").textContent = "Sunucular beklemede."; }
  else { et.className = "etiket bos"; et.innerHTML = "<i></i>boş bulut"; $("#kahramanBaslik").textContent = BULUT ? "Kendi bulutun, 7/24 açık." : "Kendi bulutun, kendi makinende."; }
  const C = 2 * Math.PI * 50, oran = top ? çal / top : 0;
  $("#halkaDolu").setAttribute("stroke-dasharray", `${(oran * C).toFixed(2)} ${C.toFixed(2)}`);
  $("#halkaDolu").classList.toggle("sifir", çal === 0);
  $("#kpiCalisan").textContent = çal;
  $("#kpiToplam").textContent = `/ ${top}`;
  $("#hsCalisan").textContent = `${çal} / ${top} sunucu`;
  $("#hsBellek").textContent = mb(ozet.toplam_bellek_kb);
  const oyuncuEl = $("#hsOyuncu");   // eski motor toplam_oyuncu göndermez: "—"
  if (oyuncuEl) oyuncuEl.textContent = ozet.toplam_oyuncu === undefined ? "—" : `${ozet.toplam_oyuncu} oyuncu`;
  $("#kpiYeniden").textContent = ornekler.reduce((t, o) => t + o.toplam_yeniden, 0) + " kez";

  // KPI
  $("#kpiBellek").textContent = mb(ozet.toplam_bellek_kb);
  $("#bellekGrafik").innerHTML = alanGrafik(bellekGecmisi);
  $("#kpiKademe").textContent = `Tier ${a.kademe} · ${a.sınıf}`;
  $("#kpiKademeAlt").textContent = `${a.gpu}`;
  $$("#kpiKademeCubuk i, #evKademe i").forEach((i, n) => i.classList.toggle("dolu", (n % 5) < a.kademe));
  $("#kpiIslemci").textContent = a.sanal_işlemci;
  $("#kpiIslemciAlt").textContent = `${a.işçi} işçi · ${a.çekirdek} çekirdek · ${a.simd}`;
  planKpiCiz();

  // ray ve üst çubuk
  $("#evDurum").textContent = `Tier ${a.kademe} · ${a.sınıf}`;
  $("#evIslemci").textContent = `${islemci} · ${a.çekirdek} çekirdek · ${(a.ram_mb / 1024).toFixed(0)} GB`;
  $("#konsolSure span").textContent = (BULUT ? "çevrimiçi · " : "konsol ") + sure(ozet.konsol_süre_sn);
  $("#konsolSure").title = BULUT ? "Bulut motorunun kesintisiz çalışma süresi" : "Konsolun çalışma süresi";
  $("#konsolSure").classList.toggle("canli", BULUT);
  $("#sayiRozet").textContent = top;
  $("#surumMetni").textContent = `MegscriptVM ${ozet.sürüm}`;
  if (location.hash === "#planlar") planlarCiz();

  // olaylar
  $("#olayListe").innerHTML = ozet.olaylar.length
    ? ozet.olaylar.slice().reverse().map((e) => `<li data-tur="${esc(e.tür)}"><time>${esc(e.zaman.slice(11, 16))}</time><div><span class="tur">${esc(e.tür)}</span>${esc(gizle(e.metin))}</div></li>`).join("")
    : '<li class="bos">Henüz olay yok.</li>';

  // donanım
  $("#cipCizim").innerHTML = cipCizimi(a);
  $("#cipAlt").textContent = islemci;
  $("#donanimListe").innerHTML = [
    ["İşlemci", a.işlemci.replace(/\s+/g, " ").trim()], ["Çekirdek", a.çekirdek + " mantıksal"], ["RAM", (a.ram_mb / 1024).toFixed(1) + " GB"], ["SIMD", a.simd],
    ["Seçilen kademe", `Tier ${a.kademe} · ${a.sınıf}`], ["Sanal GPU", a.gpu], ["Sanal işlemci", `${a.sanal_işlemci} (${a.işçi} işçi)`],
    ["Sanal VRAM sınırı", mb(a.vram_mb * 1024)], ["Platform", ozet.platform],
  ].map(([k2, v]) => `<dt>${esc(k2)}</dt><dd>${esc(gizle(v))}</dd>`).join("");
  kademeCiz();
}

function makinelerCiz() {
  const q = ($("#aramaKutusu").value || "").toLowerCase();
  const liste = ornekler.filter((o) => (filtre === "hepsi" || (filtre === "çalışıyor" ? o.durum === "çalışıyor" : o.durum !== "çalışıyor")) &&
    (!q || o.ad.toLowerCase().includes(q) || (o.not || "").toLowerCase().includes(q)));
  $("#anaListe").innerHTML = !ornekler.length ? bosDurum(false)
    : liste.length ? liste.map(makineKarti).join("")
    : `<div class="bos-durum"><b>Eşleşen sunucu yok</b><p>Süzgeci ya da arama metnini değiştir.</p></div>`;
  $("#ozetListe").innerHTML = ornekler.length ? ornekler.slice(0, 5).map(miniOge).join("") : bosDurum(true);
  const s = $("#gunlukSecim"), onceki = s.value;
  s.innerHTML = ornekler.map((o) => `<option value="${esc(o.ad)}">${esc(o.ad)} — ${durumAd[o.durum] || esc(o.durum)}</option>`).join("") || "<option value=''>henüz sunucu yok</option>";
  if (gunlukAd && ornekler.some((o) => o.ad === gunlukAd)) s.value = gunlukAd;
  else if (onceki && ornekler.some((o) => o.ad === onceki)) s.value = onceki;
}

function kademeCiz() {
  const bu = ozet ? ozet.ana_makine.kademe : 0;
  const enCok = Math.log(76);
  $("#merdiven").innerHTML = KADEMELER.map((k) => {
    const g = parseFloat(k.guc) || 1, h = 22 + 78 * (Math.log(g + 1) / enCok);
    return `<div class="basamak ${k.n === bu ? "bu" : ""} ${k.arastirma ? "arastirma" : ""}">
      <div class="sutun" style="height:${h.toFixed(0)}%"><b>${k.guc}</b></div>
      <small><b>Tier ${k.n}</b>${k.sinif}</small></div>`;
  }).join("");
  $("#kademeIzgara").innerHTML = KADEMELER.map((k) => `<div class="kademe-kart ${k.n === bu ? "bu" : ""}">
    <div class="ust-satir"><h4>Tier ${k.n}<small>${k.sinif}</small></h4>${k.n === bu ? '<span class="rozet koz">düğüm</span>' : k.arastirma ? '<span class="rozet">araştırma</span>' : ""}</div>
    <div class="guc">${k.guc}</div>
    <dl><dt>Sanal GPU</dt><dd>${k.gpu}</dd><dt>Sanal işlemci</dt><dd>${k.cpu}</dd>
    <dt>vCPU</dt><dd>${k.vcpu}</dd><dt>İşçi</dt><dd>${k.isci}</dd><dt>VRAM tavanı</dt><dd>${k.vram}</dd><dt>SIMD</dt><dd>${k.simd}</dd></dl>
    <p>${k.rol}</p></div>`).join("");
}

function baglantiDurumu(var_, neden) {
  bagli = var_;
  $("#nabiz").className = "nabiz " + (var_ ? "canli" : "kopuk");
  const serit = $("#kopukSerit");
  serit.hidden = var_;
  if (!var_ && DOSYADAN) {
    serit.querySelector("span:not(.kopuk-ikon)").innerHTML =
      "Bu sayfayı dosya olarak açtın; arayüz yalnız konsolun adresinden çalışır. <code>uygulamalar/megscriptvm/MegscriptVM.cmd</code> dosyasına çift tıkla, doğru adres kendiliğinden açılır.";
  } else if (!var_ && BULUT) {
    serit.querySelector("b").textContent = "Bulut motoru yanıt vermiyor";
    serit.querySelector("span:not(.kopuk-ikon)").textContent = (neden || ULASILAMADI) +
      " Sunucuların kayıtlı; motor geri gelince çalışmaya devam ederler ve bu sayfa kendiliğinden bağlanır.";
  }
  if (!var_) {
    $("#evDurum").textContent = BULUT ? "Buluta ulaşılamıyor" : "Konsola ulaşılamıyor";
    const et = $("#kahramanEtiket");
    et.className = "etiket kopuk";
    et.innerHTML = "<i></i>bağlantı yok";
    $(".kahraman").classList.remove("canli");
    planKpiCiz();
  }
}

// ---------------------------------------------------------------- tazeleme
async function tazele() {
  if (girisAcik) return;
  try {
    [ozet, ornekler] = await Promise.all([al("/api/ozet"), al("/api/ornekler")]);
    bellekGecmisi.push(ozet.toplam_bellek_kb);
    if (bellekGecmisi.length > 90) bellekGecmisi.shift();
    baglantiDurumu(true);
    ozetCiz();
    makinelerCiz();
    if (location.hash === "#gunlukler") gunlukTazele();
    if (hesap) { hesapMenuCiz(); if (location.hash === "#hesabim") hesabimEkCiz(); }
  } catch (e) {
    if (!e.giris) baglantiDurumu(false, e.motorYok ? e.message : null);
  }
}

// ---------------------------------------------------------------- hesap (yalnız bulut: Google ile kayıt ve giriş)
let yap = null;                      // /api/yapilandirma: Google istemci kimliği, planlar
let gsiMod = "giris";                // hangi Google düğmesine basıldı: giris | kayit
let googleCizildi = false;           // Google düğmeleri bir kez çizilir (iki adımda da durur)
let kayitVerisi = null;              // Google'dan sonra kayıt formu için
let bekleSayaci = null;
const PLAN_IKON = '<svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/></svg>';
const TAC_IKON = '<svg viewBox="0 0 24 24"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/></svg>';
const AMAC_AD = { oyun: "Oyun sunucusu", bot: "Sohbet botu", api: "Web / API", ogrenme: "Öğrenme", diger: "Diğer" };
const DURUM_AD = { bekliyor: "Onay bekliyor", aktif: "Aktif", askida: "Askıda", reddedildi: "Reddedildi" };
const DENEYIM_AD = { yeni: "Yeni başlıyor", orta: "Biraz deneyimli", uzman: "Deneyimli geliştirici" };
const TUR_AD = { bireysel: "Bireysel", ekip: "Ekip", sirket: "Şirket" };
const KAYNAK_AD = { arkadas: "arkadaş tavsiyesi", youtube: "YouTube", sosyal: "sosyal medya", discord: "Discord", arama: "Google araması", diger: "diğer" };
function profilOzeti(p) {             // yönetim tablosunda onay için kısa profil
  if (!p) return "";
  const yas = p.dogum_yili ? new Date().getFullYear() - p.dogum_yili : 0;
  const parca = [DENEYIM_AD[p.deneyim], p.hesap_turu !== "bireysel" ? `${TUR_AD[p.hesap_turu]}: ${p.kurum}` : TUR_AD[p.hesap_turu],
    [p.sehir, p.ulke].filter(Boolean).join(", "), yas ? `${yas} yaş` : "", p.kaynak ? `kaynak: ${KAYNAK_AD[p.kaynak] || p.kaynak}` : ""].filter(Boolean);
  return `<small class="profil-ozet">${esc(parca.join(" · "))}</small>${p.proje ? `<small class="profil-proje">“${esc(p.proje)}”</small>` : ""}`;
}
const tarih = (s) => { try { return new Date(s).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" }); } catch (e) { return "—"; } };
const fiyatMetni = (f) => (f ? `$${f}` : "Ücretsiz");

function resimKoy(kutu, url, ad) {
  kutu.textContent = (ad || "?").trim().charAt(0).toLocaleUpperCase("tr");
  if (url && /^https:\/\/[a-z0-9.-]+\.googleusercontent\.com\//i.test(url)) {
    const img = new Image();
    img.alt = "";
    img.referrerPolicy = "no-referrer";
    img.onload = () => { kutu.textContent = ""; kutu.append(img); };
    img.src = url;
  }
}

function planRozeti(h) {
  if (!h) return "";
  if (h.yonetici) return `<span class="plan-rozet yonetici">${TAC_IKON}Yönetici</span>`;
  return `<span class="plan-rozet ${h.plan.fiyat ? "ucretli" : ""}">${esc(h.plan.ad)}</span>`;
}

// Gece bakımı duyurusu: girişli bulut kullanıcısına gösterilir; kapatılınca 7 gün gizli kalır (yalnız bu tarayıcıda).
const DUYURU_ANAHTAR = "mscriptvm-duyuru-gece-0300";
function duyuruCiz() {
  let gizli = 0;
  try { gizli = +localStorage.getItem(DUYURU_ANAHTAR) || 0; } catch (e) { /* özel pencere */ }
  $("#duyuruSerit").hidden = !(BULUT && hesap) || Date.now() < gizli;
}
$("#duyuruAyrinti").addEventListener("click", (e) => {
  const u = $("#duyuruUzun"), acik = u.hidden;
  u.hidden = !acik;
  e.currentTarget.setAttribute("aria-expanded", String(acik));
  e.currentTarget.textContent = acik ? "Gizle" : "Ayrıntılar";
});
$("#duyuruKapat").addEventListener("click", () => {
  try { localStorage.setItem(DUYURU_ANAHTAR, String(Date.now() + 7 * 86400000)); } catch (e) { /* özel pencere */ }
  $("#duyuruSerit").hidden = true;
});

function hesapCiz() {
  duyuruCiz();
  const k = $("#hesap");
  $$("[data-bulut]").forEach((e) => (e.hidden = !BULUT || !hesap));
  $$("[data-yonetici]").forEach((e) => (e.hidden = !(hesap && hesap.yonetici)));
  $("#temaDugme").hidden = !!hesap;            // girişliyken tema hesap menüsünde
  // "Yükselt": profilin yanında; yönetici (her şey ücretsiz) ve en üst plan (Titan) dışında görünür
  $("#yukseltDugme").hidden = !(BULUT && hesap && !hesap.yonetici && hesap.durum === "aktif" && hesap.plan && hesap.plan.id !== "titan");
  if (!hesap) { k.hidden = true; hesapMenuKapat(); return; }
  k.hidden = false;
  $("#hesapDugme").title = `${hesap.ad || ""} · ${hesap.eposta}`;
  resimKoy($("#hesapResim"), hesap.resim, hesap.ad || hesap.eposta);
  hesapMenuCiz();
  if (hesap.yonetici) bekleyenSay();
}

let gsiSozu = null;
function gsiYukle() {                 // Google Identity Services betiği yalnız giriş ekranında yüklenir
  if (!gsiSozu) gsiSozu = new Promise((coz, red) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = coz;
    s.onerror = () => { gsiSozu = null; red(new Error("Google girişi yüklenemedi (ağ ya da reklam engelleyici).")); };
    document.head.append(s);
  });
  return gsiSozu;
}

function girisHatasi(metin) {
  const h = $("#girisHata");
  h.textContent = metin || "";
  h.hidden = !metin;
}

function adimGoster(adim) {
  $$(".giris-adim").forEach((s) => (s.hidden = s.dataset.adim !== adim));
  $(".giris-kart").scrollTop = 0;
}

async function yapilandirmaAl() {
  if (!yap) yap = await al("/api/yapilandirma");
  return yap;
}

async function girisGoster(adim = "giris") {
  girisAcik = true;
  clearInterval(bekleSayaci);
  cekmeceKapat();
  $("#giris").hidden = false;
  document.body.classList.add("giriste");
  adimGoster(adim);
  if (adim !== "giris" && adim !== "kaydol") return;
  hesap = null;
  hesapCiz();
  girisHatasi("");
  $("#epostaKayitHata").hidden = true;
  $("#kayitCagri").hidden = true;
  setTimeout(() => { const g = $(`.giris-adim[data-adim="${adim}"] input`); if (g && !g.value && matchMedia("(pointer:fine)").matches) g.focus(); }, 150);
  if (googleCizildi) return;
  try {
    const y = await yapilandirmaAl();
    if (!y.google_istemci) {                 // Google ayarlı değilse e-posta ile giriş yine çalışır
      $$(".google-yer").forEach((g) => (g.hidden = true));
      $$(".giris-adim .ayrac").forEach((g) => (g.hidden = true));
      return;
    }
    await gsiYukle();
    google.accounts.id.initialize({
      client_id: y.google_istemci, callback: googleDondu, ux_mode: "popup",
      auto_select: false, itp_support: true, context: "signin",
    });
    const koyu = document.documentElement.dataset.tema !== "acik";
    const en = Math.min(320, $(".giris-kart").clientWidth - 60);
    const ortak = { theme: koyu ? "filled_black" : "outline", size: "large", shape: "pill", locale: "tr", width: en, logo_alignment: "left" };
    $("#googleGiris").innerHTML = $("#googleKayit").innerHTML = "";
    google.accounts.id.renderButton($("#googleGiris"), { ...ortak, text: "signin_with", click_listener: () => (gsiMod = "giris") });
    google.accounts.id.renderButton($("#googleKayit"), { ...ortak, text: "signup_with", click_listener: () => (gsiMod = "kayit") });
    googleCizildi = true;
  } catch (e) {
    girisHatasi(e.message);
  }
}

async function googleDondu(yanit) {
  girisHatasi("");
  $("#kayitCagri").hidden = true;
  try {
    if (gsiMod === "kayit") {
      const r = await gonder("/api/kayit/baslat", { jeton: yanit.credential });
      if (r.kayit_jetonu) return kayitFormuGoster(r);
      return hesapAcildi(r, "Zaten kayıtlıymışsın; giriş yapıldı.");
    }
    hesapAcildi(await gonder("/api/giris", { jeton: yanit.credential }));
  } catch (e) {
    if (e.veri && e.veri.kayit_gerek) { adimGoster("giris"); $("#kayitCagri").hidden = false; return; }
    if (gsiMod === "kayit") { const k = $("#epostaKayitHata"); k.textContent = e.message; k.hidden = false; return; }
    girisHatasi(e.message);
  }
}

// Giriş ya da kayıttan sonra: aktifse panele, değilse onay ekranına.
function hesapAcildi(h, mesaj) {
  hesap = h;
  hesapCiz();
  if (h.durum !== "aktif") return bekleGoster();
  girisAcik = false;
  clearInterval(bekleSayaci);
  $("#giris").hidden = true;
  document.body.classList.remove("giriste");
  bildir(mesaj || `Hoş geldin, ${h.ad || h.eposta}`);
  sayfaGoster();
  tazele();
}

// ---------------------------------------------------------------- kayıt formu
let kadiSayaci = null, kadiUygun = false;
function kayitFormuGoster(k) {
  kayitVerisi = k;
  const f = $("#kayitForm");
  f.reset();
  f.ad.value = k.ad || "";
  f.kadi.value = k.kadi_onerisi || "";
  $("#kayitEposta").textContent = k.eposta;
  $("#kayitKaynak").lastChild.textContent = k.giris_turu === "eposta" ? "E-posta ve şifreyle" : "Google ile doğrulandı";
  $("#kayitVazgec").textContent = k.giris_turu === "eposta" ? "Değiştir" : "Başka hesap";
  resimKoy($("#kayitResim"), k.resim, k.ad || k.eposta);
  $$("#amacSec button").forEach((b, i) => b.classList.toggle("secili", i === 0));
  $$("#deneyimSec button").forEach((b) => b.classList.remove("secili"));
  $$("#turSec button").forEach((b, i) => b.classList.toggle("secili", i === 0));
  $("#kurumAlan").hidden = true;
  const yilSec = $("#dogumYili");
  if (yilSec.options.length < 2) {
    const y = new Date().getFullYear();
    for (let i = y - 13; i >= y - 100; i--) yilSec.add(new Option(String(i), String(i)));
  }
  $("#projeSayac").textContent = "0 / 400";
  const planlar = (yap && yap.planlar) || [];
  $("#kayitPlanlar").innerHTML = planlar.map((p, i) => `<button type="button" data-plan="${esc(p.id)}" class="${i === 0 ? "secili" : ""}">
    ${p.one ? '<span class="one-cikan">önerilen</span>' : ""}<b>${esc(p.ad)}</b>
    <span class="fiyat">${fiyatMetni(p.fiyat)}${p.fiyat ? "<small> / ay</small>" : ""}</span><span class="ozet">${esc(p.ozet)}</span></button>`).join("");
  $("#kayitHata").hidden = true;
  adimGoster("kayit");
  kadiDenetle();
  setTimeout(() => (f.ad.value ? f.kadi : f.ad).focus(), 200);
}

function kadiDenetle() {
  const g = $("#kayitForm").kadi, d = $("#kadiDurum"), n = $("#kadiNot");
  clearTimeout(kadiSayaci);
  const v = g.value.trim().toLowerCase();
  if (g.value !== v) g.value = v;
  kadiUygun = false;
  g.classList.remove("hatali");
  if (!v) { d.className = "kadi-durum"; n.className = ""; n.textContent = "3–24 karakter: küçük harf, rakam, _ ve -"; return; }
  if (!/^[a-z0-9][a-z0-9_-]{2,23}$/.test(v)) {
    d.className = "kadi-durum kotu"; n.className = "kotu"; n.textContent = "Harf ya da rakamla başlamalı; 3–24 karakter, yalnız a–z 0–9 _ -";
    return;
  }
  d.className = "kadi-durum bakiliyor"; n.className = ""; n.textContent = "Bakılıyor…";
  kadiSayaci = setTimeout(async () => {
    try {
      const r = await al("/api/kadi?ad=" + encodeURIComponent(v));
      if ($("#kayitForm").kadi.value !== v) return;
      kadiUygun = r.uygun;
      d.className = "kadi-durum " + (r.uygun ? "iyi" : "kotu");
      n.className = r.uygun ? "iyi" : "kotu";
      n.textContent = r.uygun ? `@${v} senin olabilir` : "Bu kullanıcı adı alınmış";
    } catch (e) { d.className = "kadi-durum"; n.textContent = ""; }
  }, 350);
}

$("#kayitForm").kadi.addEventListener("input", kadiDenetle);
$("#kayitVazgec").addEventListener("click", () => {
  const eposta = kayitVerisi && kayitVerisi.giris_turu === "eposta";
  kayitVerisi = null;
  girisGoster(eposta ? "kaydol" : "giris");
});

// ---------------------------------------------------------------- e-posta + şifre
function dugmeMesgul(d, metin) {
  const s = d.querySelector("span");
  if (!d.dataset.asil) d.dataset.asil = s.textContent;
  d.disabled = !!metin;
  s.textContent = metin || d.dataset.asil;
}
function sifreGucu(s) {
  if (!s) return 0;
  let p = 0;
  if (s.length >= 8) p++;
  if (s.length >= 12) p++;
  if (/[a-zçğıöşü]/.test(s) && /[A-ZÇĞİÖŞÜ]/.test(s)) p++;
  if (/\d/.test(s)) p++;
  if (/[^A-Za-z0-9çğıöşüÇĞİÖŞÜ]/.test(s)) p++;
  if (s.length < 8) return 1;
  return Math.min(4, Math.max(1, p - 1));
}
const GUC_METNI = ["Harf, rakam ve sembol karıştır.", "Zayıf: en az 8 karakter olmalı", "Orta: biraz daha uzat", "İyi şifre", "Çok güçlü"];
$("#epostaKayitForm").sifre.addEventListener("input", (e) => {
  const g = sifreGucu(e.target.value), k = $("#sifreGuc");
  k.dataset.seviye = g;
  k.querySelector("small").textContent = GUC_METNI[g];
});
document.addEventListener("click", (e) => {
  const goz = e.target.closest("[data-goz]");
  if (goz) {
    const i = goz.parentElement.querySelector("input");
    const ac = i.type === "password";
    i.type = ac ? "text" : "password";
    goz.classList.toggle("acik", ac);
    goz.setAttribute("aria-label", ac ? "Şifreyi gizle" : "Şifreyi göster");
  }
  const git = e.target.closest("[data-adim-git]");
  if (git) { e.preventDefault(); girisGoster(git.dataset.adimGit); }
});
$("#unuttumBag").addEventListener("click", (e) => {      // yazılan e-postayı sıfırlama sayfasına taşı
  const v = $("#epostaGirisForm").eposta.value.trim();
  if (v) e.currentTarget.href = "/sifre#e=" + encodeURIComponent(v);
});

$("#epostaGirisForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target, d = $("#epostaGirisDugme");
  girisHatasi("");
  $("#kayitCagri").hidden = true;
  $$("#epostaGirisForm .hatali").forEach((x) => x.classList.remove("hatali"));
  if (!/^\S+@\S+\.\S+$/.test(f.eposta.value.trim())) { f.eposta.classList.add("hatali"); f.eposta.focus(); return girisHatasi("Geçerli bir e-posta adresi yaz."); }
  if (!f.sifre.value) { f.sifre.classList.add("hatali"); f.sifre.focus(); return girisHatasi("Şifreni yaz."); }
  dugmeMesgul(d, "Giriş yapılıyor…");
  try {
    hesapAcildi(await gonder("/api/eposta/giris", { eposta: f.eposta.value.trim(), sifre: f.sifre.value }));
    f.sifre.value = "";
  } catch (er) {
    f.sifre.select();
    girisHatasi(er.message);
  } finally { dugmeMesgul(d, ""); }
});

$("#epostaKayitForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target, d = $("#epostaKayitDugme"), h = $("#epostaKayitHata");
  const hataGoster = (m, alan) => { h.textContent = m; h.hidden = false; if (alan && f[alan]) { f[alan].classList.add("hatali"); f[alan].focus(); } };
  h.hidden = true;
  $$("#epostaKayitForm .hatali").forEach((x) => x.classList.remove("hatali"));
  if (f.ad.value.trim().length < 2) return hataGoster("Adını yaz (en az 2 harf).", "ad");
  if (!/^\S+@\S+\.\S+$/.test(f.eposta.value.trim())) return hataGoster("Geçerli bir e-posta adresi yaz.", "eposta");
  if (f.sifre.value.length < 8) return hataGoster("Şifre en az 8 karakter olmalı.", "sifre");
  if (f.sifre.value !== f.sifre2.value) return hataGoster("İki şifre aynı değil.", "sifre2");
  dugmeMesgul(d, "Denetleniyor…");
  try {
    const r = await gonder("/api/eposta/kayit", { ad: f.ad.value.trim(), eposta: f.eposta.value.trim(), sifre: f.sifre.value });
    if (r.dogrulama_gerek) dogrulaGoster(r); else kayitFormuGoster(r);
  } catch (er) {
    hataGoster(er.message, er.veri && er.veri.alan);
  } finally { dugmeMesgul(d, ""); }
});

// ---- 6 haneli doğrulama kodu
let dogrulamaVerisi = null;
const kodGirdileri = () => $$("#kodKutulari input");
function dogrulaGoster(r) {
  dogrulamaVerisi = r;
  $("#dogrulaEposta").textContent = r.eposta;
  $("#dogrulaHata").hidden = true;
  kodGirdileri().forEach((g) => { g.value = ""; g.classList.remove("hatali"); });
  adimGoster("dogrula");
  setTimeout(() => kodGirdileri()[0].focus(), 150);
}
function kodYaz(baslangic, metin) {
  const g = kodGirdileri(), r = metin.replace(/\D/g, "").split("");
  let i = baslangic;
  for (const c of r) { if (i >= g.length) break; g[i++].value = c; }
  g[Math.min(i, g.length - 1)].focus();
  if (g.every((x) => x.value)) $("#dogrulaForm").requestSubmit();
}
$("#kodKutulari").addEventListener("input", (e) => {
  const g = kodGirdileri(), i = g.indexOf(e.target);
  const v = e.inputType === "insertText" && e.data ? e.data : e.target.value;   // dolu kutuya yazılan yeni rakam
  e.target.classList.remove("hatali");
  e.target.value = "";
  if (v) kodYaz(i, v);
});
$("#kodKutulari").addEventListener("keydown", (e) => {
  const g = kodGirdileri(), i = g.indexOf(e.target);
  if (e.key === "Backspace" && !e.target.value && i > 0) { g[i - 1].value = ""; g[i - 1].focus(); e.preventDefault(); }
  if (e.key === "ArrowLeft" && i > 0) g[i - 1].focus();
  if (e.key === "ArrowRight" && i < g.length - 1) g[i + 1].focus();
});
$("#kodKutulari").addEventListener("paste", (e) => {
  e.preventDefault();
  kodYaz(0, (e.clipboardData || window.clipboardData).getData("text"));
});
$("#dogrulaForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const d = $("#dogrulaDugme"), h = $("#dogrulaHata"), kod = kodGirdileri().map((g) => g.value).join("");
  h.hidden = true;
  if (kod.length !== 6) { h.textContent = "E-postandaki 6 haneli kodu yaz."; h.hidden = false; return; }
  if (d.disabled) return;
  dugmeMesgul(d, "Doğrulanıyor…");
  try {
    kayitFormuGoster(await gonder("/api/eposta/dogrula", { dogrulama_jetonu: dogrulamaVerisi.dogrulama_jetonu, kod }));
  } catch (er) {
    if (er.veri && er.veri.kayit_yeniden) { girisGoster("kaydol"); const k = $("#epostaKayitHata"); k.textContent = er.message; k.hidden = false; return; }
    h.textContent = er.message; h.hidden = false;
    kodGirdileri().forEach((g) => { g.classList.add("hatali"); g.value = ""; });
    kodGirdileri()[0].focus();
  } finally { dugmeMesgul(d, ""); }
});
$("#kodYeniden").addEventListener("click", async (e) => {
  e.preventDefault();
  const a = e.currentTarget;
  if (a.dataset.bekle) return;
  try {
    const r = await gonder("/api/eposta/kod-yeniden", { dogrulama_jetonu: dogrulamaVerisi.dogrulama_jetonu });
    dogrulamaVerisi = r;
    bildir("Yeni kod gönderildi");
    let kalan = 60;
    a.dataset.bekle = "1";
    const t = setInterval(() => {
      a.textContent = --kalan > 0 ? `Yeniden gönder (${kalan})` : "Yeniden gönder";
      if (kalan <= 0) { clearInterval(t); delete a.dataset.bekle; }
    }, 1000);
  } catch (er) { const h = $("#dogrulaHata"); h.textContent = er.message; h.hidden = false; }
});
$("#kayitForm").proje.addEventListener("input", (e) => ($("#projeSayac").textContent = `${e.target.value.length} / 400`));
$("#kayitForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target, h = $("#kayitHata"), d = $("#kayitDugme");
  const hataGoster = (m, alan) => { h.textContent = m; h.hidden = false; if (alan && f[alan]) { f[alan].classList.add("hatali"); f[alan].focus(); } };
  h.hidden = true;
  $$("#kayitForm .hatali").forEach((x) => x.classList.remove("hatali"));
  if (f.ad.value.trim().length < 2) return hataGoster("Adını yaz (en az 2 harf).", "ad");
  if (!kadiUygun) return hataGoster("Uygun bir kullanıcı adı seç.", "kadi");
  const secim = (id) => (($(id + " .secili") || {}).dataset || {}).v || "";
  if (!secim("#deneyimSec")) { $("#deneyimSec").scrollIntoView({ block: "center", behavior: "smooth" }); return hataGoster("Deneyim düzeyini seç."); }
  if (secim("#turSec") !== "bireysel" && f.kurum.value.trim().length < 2) return hataGoster("Ekip ya da şirket adını yaz.", "kurum");
  if (!f.dogum_yili.value) return hataGoster("Doğum yılını seç.", "dogum_yili");
  if (!f.kosullar.checked) return hataGoster("Devam etmek için kullanım koşullarını kabul et.");
  d.disabled = true;
  d.querySelector("span").textContent = "Hesabın oluşturuluyor…";
  try {
    const r = await gonder("/api/kayit/tamamla", {
      kayit_jetonu: kayitVerisi.kayit_jetonu, ad: f.ad.value.trim(), kadi: f.kadi.value,
      amac: ($("#amacSec .secili") || {}).dataset?.v || "diger",
      plan: ($("#kayitPlanlar .secili") || {}).dataset?.plan || "kivilcim", kosullar: "1",
      deneyim: secim("#deneyimSec"), hesap_turu: secim("#turSec"), kurum: f.kurum.value.trim(),
      ulke: f.ulke.value, sehir: f.sehir.value.trim(), dogum_yili: f.dogum_yili.value, kaynak: f.kaynak.value,
      proje: f.proje.value.trim(), bulten: f.bulten.checked ? "1" : "",
    });
    hesapAcildi(r, "Hesabın oluşturuldu");
  } catch (er) {
    if (er.veri && er.veri.kayit_yeniden) { girisGoster("giris"); return girisHatasi(er.message); }
    hataGoster(er.message, er.veri && er.veri.alan);
  } finally {
    d.disabled = false;
    d.querySelector("span").textContent = "Hesabımı oluştur";
  }
});

// ---------------------------------------------------------------- onay bekliyor / askıda
function bekleGoster() {
  girisGoster("bekliyor");
  const askida = hesap.durum === "askida" || hesap.durum === "reddedildi";
  $("#bekleRozet").classList.toggle("askida", askida);
  $("#bekleBaslik").textContent = askida ? (hesap.durum === "askida" ? "Hesabın askıya alındı" : "Başvurun onaylanmadı") : "Başvurun alındı";
  $("#bekleMetin").textContent = askida
    ? "Bu hesapla şu an sunucu çalıştıramazsın. Bir yanlışlık olduğunu düşünüyorsan yöneticiyle iletişime geç."
    : "Hesabın oluşturuldu ve yönetici onayına gönderildi. Onaylanınca bu sayfa kendiliğinden açılır.";
  $("#bekleCizgi").hidden = askida;
  $("#bekleTarih").textContent = tarih(hesap.olusturma);
  const istenen = hesap.istenen_plan && yap ? (yap.planlar.find((p) => p.id === hesap.istenen_plan) || {}).ad : "";
  $("#bekleOzet").innerHTML = [["Hesap", "@" + (hesap.kadi || "—")], ["E-posta", hesap.eposta], ["Plan", istenen ? `${hesap.plan.ad} → ${istenen}` : hesap.plan.ad]]
    .map(([a, b]) => `<div><dt>${esc(a)}</dt><dd title="${esc(b)}">${esc(b)}</dd></div>`).join("");
  clearInterval(bekleSayaci);
  if (!askida) bekleSayaci = setInterval(bekleYokla, 15000);
}
async function bekleYokla() {
  try {
    const h = await al("/api/ben");
    if (h.durum === "aktif") hesapAcildi(h, "Hesabın onaylandı — bulutun hazır!");
    else if (h.durum !== hesap.durum) { hesap = h; bekleGoster(); }
  } catch (e) { /* bir sonraki yoklamada */ }
}
$("#bekleYenile").addEventListener("click", bekleYokla);
$("#bekleCikis").addEventListener("click", cikisYap);

async function cikisYap() {
  try { await gonder("/api/cikis"); } catch (e) { /* çerez zaten yoksa da çıkılmış sayılır */ }
  try { if (window.google && google.accounts) google.accounts.id.disableAutoSelect(); } catch (e) { /* yok */ }
  ozet = null; ornekler = []; hesap = null;
  girisGoster("giris");
}
$("#cikisDugme").addEventListener("click", cikisYap);

// kullanım koşulları
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-kosullar]")) { e.preventDefault(); $("#kosulModal").hidden = false; }
  if (e.target.closest("[data-kosul-kapat]") || e.target === $("#kosulModal")) $("#kosulModal").hidden = true;
  const a = e.target.closest("#amacSec button, #deneyimSec button, #turSec button");
  if (a) {
    [...a.parentElement.children].forEach((b) => b.classList.toggle("secili", b === a));
    if (a.parentElement.id === "turSec") {
      $("#kurumAlan").hidden = a.dataset.v === "bireysel";
      $("#kurumAlan span").textContent = a.dataset.v === "sirket" ? "Şirket adı" : "Ekip / topluluk adı";
      if (!$("#kurumAlan").hidden) $("#kayitForm").kurum.focus();
    }
  }
  const p = e.target.closest("#kayitPlanlar button");
  if (p) $$("#kayitPlanlar button").forEach((b) => b.classList.toggle("secili", b === p));
});

// ---------------------------------------------------------------- plan bilgisi ve kota
function planSiniri() {                // { t, q, qs, m, c, ad, yonetici } ya da null (yerel: sınırsız)
  if (!BULUT || !hesap) return null;
  return { ...hesap.plan, yonetici: hesap.yonetici };
}
function kotaKullanimi() {
  return ozet && ozet.plan ? ozet.plan.kullanılan_sn || 0 : 0;
}
const saat = (sn) => (sn / 3600 >= 10 ? Math.round(sn / 3600) : (sn / 3600).toFixed(1)).toString().replace(".", ",");

function planKpiCiz() {
  const p = planSiniri();
  const kota = $("#kpiKota");
  if (!p) { $("#kpiPlan").textContent = "Yerel"; $("#kpiPlanAlt").textContent = "bütün kademeler açık"; kota.hidden = true; return; }
  if (p.yonetici) { $("#kpiPlan").textContent = "Yönetici"; $("#kpiPlanAlt").textContent = "Tier 1–5 sınırsız · ücretsiz"; kota.hidden = true; return; }
  $("#kpiPlan").textContent = p.ad;
  if (p.q) {
    const k = kotaKullanimi(), oran = Math.min(1, k / p.qs);
    $("#kpiPlanAlt").textContent = `Tier ${p.q} kotası: ${saat(k)} / ${saat(p.qs)} sa`;
    kota.hidden = false;
    kota.classList.toggle("dolu", oran >= 1);
    kota.firstElementChild.style.width = (oran * 100).toFixed(1) + "%";
  } else {
    $("#kpiPlanAlt").textContent = `Tier 1–${p.t} sınırsız`;
    kota.hidden = true;
  }
}

function planlarCiz() {
  if (!BULUT || !hesap || !yap) return;
  const p = planSiniri();
  const ust = $(".plan-ust");
  $("#planEtiket").innerHTML = `<i></i>${p.yonetici ? "yönetici" : "mevcut plan"}`;
  $("#planBaslik").textContent = p.yonetici ? "Her şey senin: bütün kademeler ücretsiz" : `${p.ad} planındasın`;
  $("#planAlt").textContent = p.yonetici
    ? "Yönetici olarak Tier 1–5 sanal işlemci ve ekran kartlarını sınırsız, kotasız ve ücretsiz kullanırsın."
    : "Kademeler ve kotalar planına göre açılır. Planını istediğin an değiştirebilirsin.";
  const satir = (ad, deger, oran) => `<div class="satir"><div><span>${ad}</span><b>${deger}</b></div>${oran != null ? `<div class="kota-cubuk ${oran >= 1 ? "dolu" : ""}"><i style="width:${(Math.min(1, oran) * 100).toFixed(1)}%"></i></div>` : ""}</div>`;
  const makineSay = ozet ? ozet.toplam : 0, calisan = ozet ? ozet.çalışan : 0;
  $("#planKota").innerHTML = p.yonetici
    ? satir("Sunucu", `${makineSay} · sınırsız`) + satir("Kademe", "Tier 1–5 · kotasız")
    : satir("Sunucu", `${makineSay} / ${p.m}`, makineSay / p.m) + satir("Aynı anda çalışan", `${calisan} / ${p.c}`, calisan / p.c) +
      (p.q ? satir(`Tier ${p.q} kotası (bu ay)`, `${saat(kotaKullanimi())} / ${saat(p.qs)} sa`, kotaKullanimi() / p.qs) : satir("Kademe", `Tier 1–${p.t} sınırsız`));
  ust.classList.toggle("yonetici", !!p.yonetici);
  const serit = p.yonetici ? `<div class="yonetici-serit">${TAC_IKON}<div><b>Yönetici hesabı</b><span>Planlar senin için ücretsiz; aşağıdaki fiyatlar kullanıcıların gördüğüdür.</span></div></div>` : "";
  $("#planIzgara").innerHTML = yap.planlar.map((k) => {
    const mevcut = !p.yonetici && k.id === p.id;
    let dugme;
    if (p.yonetici) dugme = `<button class="dugme" disabled>Sana ücretsiz</button>`;
    else if (mevcut) dugme = `<button class="dugme" disabled>Mevcut planın</button>`;
    else if (!k.odeme) dugme = `<button class="dugme" disabled>Yakında</button>`;
    else dugme = `<button class="dugme ${k.fiyat > (p.fiyat || 0) ? "birincil" : ""}" data-plan-sec="${esc(k.id)}">${k.fiyat > (p.fiyat || 0) ? "Yükselt" : "Bu plana geç"}</button>`;
    return `<article class="plan-kart ${k.one ? "one" : ""} ${mevcut ? "mevcut" : ""}">
      ${k.one ? '<span class="serit">en çok seçilen</span>' : mevcut ? '<span class="serit">mevcut</span>' : ""}
      <div><h3>${esc(k.ad)}</h3></div><p class="plan-ozet">${esc(k.ozet)}</p>
      <div class="fiyat"><b>${k.fiyat ? "$" + k.fiyat : "$0"}</b><small>${k.fiyat ? "/ ay" : "her zaman"}</small></div>
      <ul>${k.ozellikler.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>${dugme}</article>`;
  }).join("");
  odemeCiz();
  const eski = $(".yonetici-serit");
  if (eski) eski.remove();
  if (serit) $("#planIzgara").insertAdjacentHTML("beforebegin", serit);
}

document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-plan-sec]");
  if (!b) return;
  const id = b.dataset.planSec, k = yap.planlar.find((x) => x.id === id);
  if (k.fiyat === 0 && !(await onayla(`${k.ad} planına geçilsin mi?`, "Ücretli planın varsa Stripe'tan aboneliğini ayrıca iptal etmen gerekir. Planın dışında kalan sunucular durdurulur."))) return;
  b.disabled = true;
  try {
    const r = await gonder("/api/plan/sec", { plan: id });
    if (r.odeme && r.gomulu) { await odemePenceresi(r.odeme, k); b.disabled = false; return; }   // Lemon Squeezy, sayfanın üstünde
    if (r.odeme) { bildir("Stripe'ın güvenli ödeme sayfasına yönlendiriliyorsun…"); location.href = r.odeme; return; }   // checkout.stripe.com
    hesap = await al("/api/ben");
    hesapCiz();
    planlarCiz();
    bildir(`${k.ad} planına geçildi`);
  } catch (er) { bildir(er.message, false); b.disabled = false; }
});

// ---------------------------------------------------------------- güncellemeler (veri: guncellemeler.js)
const GUNCEL = typeof GUNCELLEMELER !== "undefined" ? GUNCELLEMELER : [];
const GUNCEL_ANAHTAR = "mscriptvm-son-gorulen-surum";
const GM_AD = { yeni: "Yeni", iyi: "İyileştirme", duzeltme: "Düzeltme" };
const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const guncelTarih = (t) => { const [y, a, g] = t.split("-").map(Number); return `${g} ${AYLAR[a - 1]} ${y}`; };
const kacisMetin = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function guncelRozetCiz() {
  const son = GUNCEL[0];
  let gorulen = "";
  try { gorulen = localStorage.getItem(GUNCEL_ANAHTAR) || ""; } catch (e) { /* özel pencere */ }
  $("#guncelRozet").hidden = !son || gorulen === son.surum;
  const bag = $("#yenilikBag");
  if (!son) return;
  bag.hidden = false;
  $("#yenilikSurum").textContent = gorulen === son.surum ? son.surum : "Yeni · " + son.surum;
  $("#yenilikMetin").textContent = son.baslik;
}
function guncellemelerCiz() {
  const liste = $("#guncelListe");
  if (!liste.dataset.cizildi) {
    liste.innerHTML = GUNCEL.map((g, i) => `
      <li class="kart guncel-surum${i === 0 ? " son" : ""}">
        <div class="guncel-bas">
          <span class="guncel-no">${kacisMetin(g.surum)}</span>
          <div><h4>${kacisMetin(g.baslik)}</h4><time datetime="${kacisMetin(g.tarih)}">${guncelTarih(g.tarih)}${i === 0 ? " · en son" : ""}</time></div>
          <span class="soluk guncel-sayi">${g.maddeler.length} değişiklik</span>
        </div>
        <ul>${g.maddeler.map(([t, m]) => `<li><span class="gm-tur ${t}">${GM_AD[t] || t}</span><span>${kacisMetin(m)}</span></li>`).join("")}</ul>
      </li>`).join("");
    liste.dataset.cizildi = "1";
  }
  if (GUNCEL[0]) try { localStorage.setItem(GUNCEL_ANAHTAR, GUNCEL[0].surum); } catch (e) { /* özel pencere */ }
  guncelRozetCiz();
}
guncelRozetCiz();

// ---------------------------------------------------------------- ödeme kartı (Hesabım sayfasında)
function odemeCiz() {
  if (!BULUT || !hesap || !yap) return;
  const p = planSiniri();
  $("#odemeKart").hidden = !!p.yonetici;
  $("#odemePlan").textContent = `${p.ad}${p.fiyat ? ` · $${p.fiyat} / ay` : " · ücretsiz"}`;
  const ls = yap.odeme_saglayici !== "stripe";
  $$("[data-saglayici]").forEach((s) => (s.textContent = ls ? "Lemon Squeezy" : "Stripe"));
  $("#odemeDurum").textContent = hesap.odeme_sorunu ? "Ödeme alınamadı — kartını güncelle"
    : hesap.iptal_tarihi ? `İptal edildi · ${tarih(hesap.iptal_tarihi)} tarihine kadar açık` : hesap.abonelik ? "Etkin" : "Yok";
  $("#odemeDurum").style.color = hesap.odeme_sorunu ? "var(--kirmizi)" : "";
  $("#odemeTarih").textContent = hesap.odeme_tarihi ? tarih(hesap.odeme_tarihi) : "—";
  $("#odemePortal").disabled = !yap.odeme_portali;
  $("#odemePortal").title = yap.odeme_portali ? "Stripe'ın güvenli sayfasında açılır" : "Ödeme yönetimi yakında açılacak";
}

// ---------------------------------------------------------------- Hesabım: bilgiler, e-posta, şifre
const GIRIS_AD = { google: "Google", eposta: "E-posta + şifre" };
let epostaJetonu = null;
const cipSec = (kap, v) => $$(kap + " button").forEach((b) => b.classList.toggle("secili", b.dataset.v === v));
const cipDegeri = (kap) => (($(kap + " .secili") || {}).dataset || {}).v || "";
function profilKurumGoster() {
  const v = cipDegeri("#profilTur"), alan = $("#profilKurumAlan");
  alan.hidden = !v || v === "bireysel";
  alan.querySelector("span").textContent = v === "sirket" ? "Şirket adı" : "Ekip / topluluk adı";
}
function epostaAdim(kodda) {
  $("#epostaForm").hidden = kodda;
  $("#epostaKodForm").hidden = !kodda;
}
const HS_DENEYIM = { yeni: "Yeni başlıyor", orta: "Biraz kod yazmış", uzman: "Deneyimli geliştirici" };
const HS_TUR = { bireysel: "Bireysel", ekip: "Ekip / topluluk", sirket: "Şirket" };
function hesabimCiz() {
  denetimOnbellek.t = 0;               // bir işlemden sonra güvenlik etkinliği tazelensin
  if (!BULUT || !hesap) return;
  const h = hesap, p = h.profil || {}, ad = (h.ad || h.eposta || "").trim();
  resimKoy($("#hbResim"), h.resim, ad);
  resimKoy($("#hsResimKucuk"), h.resim, ad);
  $("#hsResimNot").textContent = "";
  $("#hsMerhaba").textContent = `Hoş geldin, ${ad.split(/\s+/)[0] || ""}`;
  // kişisel bilgiler satırları
  $("#hsDegAd").textContent = h.ad || "—";
  $("#hsDegKadi").textContent = h.kadi ? "@" + h.kadi : "—";
  $("#hsDegDeneyim").textContent = HS_DENEYIM[p.deneyim] || "Belirtilmedi";
  $("#hsDegTur").textContent = (HS_TUR[p.hesap_turu] || "Bireysel") + (p.kurum && p.hesap_turu !== "bireysel" ? " · " + p.kurum : "");
  $("#hsDegKonum").textContent = [p.sehir, p.ulke].filter(Boolean).join(", ") || "Belirtilmedi";
  $("#hsDegUyelik").textContent = h.olusturma ? tarih(h.olusturma) : "—";
  $("#hsDegEposta").innerHTML = `${esc(h.eposta)} ${h.eposta_dogru ? '<em class="eposta-rozet">doğrulandı</em>' : '<em class="eposta-rozet uyari">doğrulanmadı</em>'}`;
  $("#hsDegBulten").textContent = $("#hsDegBulten2").textContent = p.bulten ? "Açık" : "Kapalı";
  $("#hsEpostaMevcut").textContent = h.eposta;
  // plan
  const pl = h.plan || {};
  $("#hsPlanAd").innerHTML = planRozeti(h) + (h.yonetici ? "" : ` <span>${pl.fiyat ? "$" + pl.fiyat + " / ay" : "Ücretsiz"}</span>`);
  $("#hsPlanOzet").textContent = h.yonetici ? "Bütün kademeler ücretsiz ve sınırsız."
    : `En çok ${pl.m || "∞"} sunucu · aynı anda ${pl.c || "∞"} çalışan · Tier ${pl.t || 1}'e kadar serbest${pl.q ? ` · Tier ${pl.q} kotalı` : ""}`;
  $("#hsPlanMetin").textContent = h.yonetici ? "Yöneticisin: her şey açık." : `${pl.ad || "Kıvılcım"} planındasın${h.abonelik ? " · abonelik etkin" : ""}.`;
  // formlar
  const f = $("#profilForm");
  f.ad.value = h.ad || "";
  const ulke = p.ulke || "Türkiye";
  if (![...f.ulke.options].some((o) => o.value === ulke)) f.ulke.add(new Option(ulke, ulke));
  f.ulke.value = ulke;
  f.sehir.value = p.sehir || "";
  f.kurum.value = p.kurum || "";
  f.bulten.checked = !!p.bulten;
  cipSec("#profilDeneyim", p.deneyim || "");
  cipSec("#profilTur", p.hesap_turu || "bireysel");
  profilKurumGoster();
  $("#profilHata").hidden = true;
  $("#epostaAciklama").textContent = h.eposta_dogru
    ? "Yeni adrese 6 haneli bir kod göndeririz; kodu yazınca e-postan değişir ve eski adresine bildirim gider."
    : "E-postan henüz doğrulanmadı. Aynı adresi yazıp kod iste ya da yeni bir adres gir.";
  $("#epostaSifreAlan").hidden = !h.sifre_var;
  $("#epostaHata").hidden = true;
  epostaAdim(false);
  $("#sifreForm").hidden = !h.sifre_var;
  $("#sifreGoogle").hidden = !!h.sifre_var;
  $("#sifreHata").hidden = true;
  odemeCiz();
  hesabimEkCiz();
}

// Hesabım içi yönlendirme: #hesabim/<bölüm>[/<düzenleme>]
const HS_BOLUM = { ana: "", kisisel: "Kişisel bilgiler", guvenlik: "Güvenlik", veri: "Veri ve gizlilik", odeme: "Ödemeler ve abonelik" };
const HS_ALAN = {
  ad: ["Ad", "Adın panelde, e-postalarda ve ekibin gördüğü yerlerde kullanılır."],
  deneyim: ["Deneyim", "Rehberleri ve önerileri deneyimine göre ayarlarız."],
  tur: ["Hesap türü", "Bireysel mi, bir ekip ya da şirket adına mı kullanıyorsun?"],
  konum: ["Konum", "Ülken ve istersen şehrin. Bakım saatlerini ve duyuruları buna göre planlarız."],
  bulten: ["Duyuru e-postaları", "Ara sıra yeni özellik duyurusu. Güvenlik ve hesap e-postaları bu tercihten bağımsız her zaman gelir."],
};
function hesapRota(parcalar) {
  let bolum = parcalar[0] || "ana";
  if (!(bolum in HS_BOLUM)) bolum = "ana";
  const alt = parcalar[1] || "";
  $$("#hsNav a").forEach((a) => a.classList.toggle("etkin", a.dataset.hs === bolum));
  $$(".hs-sayfa").forEach((d) => (d.hidden = d.dataset.hsSayfa !== bolum));
  const sayfa = $(`.hs-sayfa[data-hs-sayfa="${bolum}"]`);
  let altAd = "";
  if (bolum === "kisisel" && HS_ALAN[alt]) altAd = "profil";
  else if (bolum === "kisisel" && alt === "eposta") altAd = "eposta";
  else if (bolum === "guvenlik" && alt === "sifre" && hesap && hesap.sifre_var) altAd = "sifre";
  $$(".hs-alt", sayfa).forEach((d) => (d.hidden = d.dataset.alt !== altAd));
  const liste = $(".hs-liste-gorunum", sayfa);
  if (liste) liste.hidden = !!altAd;
  if (altAd === "profil") {
    const [baslik, aciklama] = HS_ALAN[alt];
    $("#hsAltBaslik").textContent = baslik;
    $("#hsAltAciklama").textContent = aciklama;
    $$("#profilForm [data-grup]").forEach((g) => (g.hidden = g.dataset.grup !== alt));
    setTimeout(() => { const g = $(`#profilForm [data-grup="${alt}"] input:not([type=checkbox]), #profilForm [data-grup="${alt}"] button`); if (g) g.focus(); }, 80);
  }
  if (altAd === "eposta") setTimeout(() => $("#epostaForm").eposta.focus(), 80);
  if (altAd === "sifre") setTimeout(() => $("#sifreForm").mevcut.focus(), 80);
  const bas = [HS_BOLUM[bolum], altAd === "profil" ? HS_ALAN[alt][0] : altAd === "eposta" ? "E-posta" : altAd === "sifre" ? "Şifre" : ""].filter(Boolean);
  $("#sayfaBaslik").textContent = bas.length ? bas[bas.length - 1] : "Hesabım";
  document.title = `${bas.length ? bas.join(" · ") + " · " : ""}Hesabım · MegscriptVM`;
}
const hesapAnaya = (bolum) => { if (location.hash.split("/").length > 2) location.hash = "#hesabim/" + bolum; };

// Hesabında ara (Google Hesabı'ndaki gibi)
const HS_ARAMA = [
  ["Ad", "Kişisel bilgiler", "#hesabim/kisisel/ad"], ["Deneyim", "Kişisel bilgiler", "#hesabim/kisisel/deneyim"],
  ["Hesap türü, ekip, şirket", "Kişisel bilgiler", "#hesabim/kisisel/tur"], ["Konum, ülke, şehir", "Kişisel bilgiler", "#hesabim/kisisel/konum"],
  ["E-posta adresini değiştir", "Kişisel bilgiler", "#hesabim/kisisel/eposta"], ["Duyuru e-postaları, bülten", "Kişisel bilgiler", "#hesabim/kisisel/bulten"],
  ["Şifre değiştir", "Güvenlik", "#hesabim/guvenlik/sifre"], ["Diğer cihazlardan çıkış, oturumlar", "Güvenlik", "#hesabim/guvenlik"],
  ["Güvenlik etkinliği, önceki giriş", "Güvenlik", "#hesabim/guvenlik"], ["Görünüm, tema, koyu, açık", "Veri ve gizlilik", "#hesabim/veri"],
  ["Verilerini indir", "Veri ve gizlilik", "#hesabim/veri"], ["Hesabı sil", "Veri ve gizlilik", "#hesabim/veri"],
  ["Plan, abonelik", "Ödemeler ve abonelik", "#hesabim/odeme"], ["Ödeme yöntemi, faturalar, iptal", "Ödemeler ve abonelik", "#hesabim/odeme"],
  ["Planları karşılaştır, yükselt", "Planlar", "#planlar"], ["Rozetler", "Ana sayfa", "#hesabim"], ["Geri bildirim, destek", "Veri ve gizlilik", "#hesabim/veri"],
];
const trKucuk = (t) => t.toLocaleLowerCase("tr");
function hsAraCiz() {
  const q = trKucuk($("#hsAra").value.trim()), kutu = $("#hsAraSonuc");
  if (!q) { kutu.hidden = true; return; }
  const l = HS_ARAMA.filter(([a, b]) => trKucuk(a + " " + b).includes(q)).slice(0, 6);
  kutu.innerHTML = l.length ? l.map(([a, b, h]) => `<a href="${h}" role="option"><b>${esc(a)}</b><small>${esc(b)}</small></a>`).join("")
    : `<p class="soluk">“${esc($("#hsAra").value.trim())}” için sonuç yok.</p>`;
  kutu.hidden = false;
}
$("#hsAra").addEventListener("input", hsAraCiz);
$("#hsAra").addEventListener("focus", hsAraCiz);
$("#hsAra").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { const a = $("#hsAraSonuc a"); if (a) { e.preventDefault(); location.hash = a.getAttribute("href"); $("#hsAra").value = ""; $("#hsAraSonuc").hidden = true; } }
  if (e.key === "Escape") { $("#hsAra").value = ""; $("#hsAraSonuc").hidden = true; }
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".hs-ara")) $("#hsAraSonuc").hidden = true;
  if (e.target.closest("#hsAraSonuc a")) { $("#hsAra").value = ""; $("#hsAraSonuc").hidden = true; }
});
$("#hesapSilDugme").addEventListener("click", async (e) => {
  if (!(await onayla("Hesap silme talebi gönderilsin mi?", "Talebin ekibe iletilir. Sana e-postayla dönüp hesabını, sunucularını ve kodlarını kalıcı olarak sileriz."))) return;
  const d = e.currentTarget;
  dugmeMesgul(d, "Gönderiliyor…");
  try {
    await gonder("/api/geri-bildirim", { tur: "diger", metin: `HESAP SİLME TALEBİ\nKullanıcı hesabının ve bütün sunucularının silinmesini istiyor. (@${hesap.kadi || "-"})`, sayfa: "#hesabim/veri" });
    bildir("Talebin ekibe iletildi; e-postanı kontrol et");
  } catch (er) { bildir(er.message, false); } finally { dugmeMesgul(d, ""); }
});
function alanHatasi(kutu, er) {
  kutu.textContent = er.message;
  kutu.hidden = false;
}
document.addEventListener("click", (e) => {
  const a = e.target.closest("#profilDeneyim button, #profilTur button");
  if (!a) return;
  [...a.parentElement.children].forEach((b) => b.classList.toggle("secili", b === a));
  if (a.parentElement.id === "profilTur") {
    profilKurumGoster();
    if (!$("#profilKurumAlan").hidden) $("#profilForm").kurum.focus();
  }
});
$("#profilForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.currentTarget, d = $("#profilKaydet"), hm = $("#profilHata");
  hm.hidden = true;
  if (f.ad.value.trim().length < 2) return alanHatasi(hm, new Error("Adını yaz (en az 2 harf)."));
  if (cipDegeri("#profilTur") !== "bireysel" && f.kurum.value.trim().length < 2) return alanHatasi(hm, new Error("Ekip ya da şirket adını yaz."));
  if (d.disabled) return;
  dugmeMesgul(d, "Kaydediliyor…");
  try {
    hesap = await gonder("/api/hesap/profil", {
      ad: f.ad.value.trim(), deneyim: cipDegeri("#profilDeneyim"), hesap_turu: cipDegeri("#profilTur"),
      kurum: f.kurum.value.trim(), ulke: f.ulke.value, sehir: f.sehir.value.trim(), bulten: f.bulten.checked ? "1" : "",
    });
    hesapCiz();
    hesabimCiz();
    bildir("Bilgilerin kaydedildi");
    hesapAnaya("kisisel");
  } catch (er) { alanHatasi(hm, er); } finally { dugmeMesgul(d, ""); }
});

// e-posta değişikliği: kod yeni adrese gider, kutular kayıttaki gibi
const ekodGirdileri = () => $$("#epostaKodKutulari input");
function ekodYaz(baslangic, metin) {
  const g = ekodGirdileri(), r = metin.replace(/\D/g, "").split("");
  let i = baslangic;
  for (const c of r) { if (i >= g.length) break; g[i++].value = c; }
  g[Math.min(i, g.length - 1)].focus();
  if (g.every((x) => x.value)) $("#epostaKodForm").requestSubmit();
}
$("#epostaKodKutulari").addEventListener("input", (e) => {
  const g = ekodGirdileri(), i = g.indexOf(e.target);
  const v = e.inputType === "insertText" && e.data ? e.data : e.target.value;
  e.target.classList.remove("hatali");
  e.target.value = "";
  if (v) ekodYaz(i, v);
});
$("#epostaKodKutulari").addEventListener("keydown", (e) => {
  const g = ekodGirdileri(), i = g.indexOf(e.target);
  if (e.key === "Backspace" && !e.target.value && i > 0) { g[i - 1].value = ""; g[i - 1].focus(); e.preventDefault(); }
  if (e.key === "ArrowLeft" && i > 0) g[i - 1].focus();
  if (e.key === "ArrowRight" && i < g.length - 1) g[i + 1].focus();
});
$("#epostaKodKutulari").addEventListener("paste", (e) => {
  e.preventDefault();
  ekodYaz(0, (e.clipboardData || window.clipboardData).getData("text"));
});
$("#epostaForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.currentTarget, d = $("#epostaDugme"), hm = $("#epostaHata");
  hm.hidden = true;
  const yeni = f.eposta.value.trim();
  if (!yeni) return alanHatasi(hm, new Error("Yeni e-posta adresini yaz."));
  if (hesap.sifre_var && !f.sifre.value) return alanHatasi(hm, new Error("Güvenlik için mevcut şifreni yaz."));
  if (d.disabled) return;
  dugmeMesgul(d, "Gönderiliyor…");
  try {
    const r = await gonder("/api/hesap/eposta/kod", { eposta: yeni, sifre: f.sifre.value });
    epostaJetonu = r.dogrulama_jetonu;
    $("#epostaYeni").textContent = r.eposta;
    ekodGirdileri().forEach((g) => { g.value = ""; g.classList.remove("hatali"); });
    $("#epostaKodHata").hidden = true;
    epostaAdim(true);
    setTimeout(() => ekodGirdileri()[0].focus(), 120);
  } catch (er) { alanHatasi(hm, er); } finally { dugmeMesgul(d, ""); }
});
$("#epostaKodForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const d = $("#epostaKodDugme"), hm = $("#epostaKodHata"), kod = ekodGirdileri().map((g) => g.value).join("");
  hm.hidden = true;
  if (kod.length !== 6) return alanHatasi(hm, new Error("E-postandaki 6 haneli kodu yaz."));
  if (d.disabled) return;
  dugmeMesgul(d, "Doğrulanıyor…");
  try {
    hesap = await gonder("/api/hesap/eposta/onayla", { dogrulama_jetonu: epostaJetonu, kod });
    epostaJetonu = null;
    $("#epostaForm").reset();
    hesapCiz();
    hesabimCiz();
    bildir("E-posta adresin doğrulandı");
    hesapAnaya("kisisel");
  } catch (er) {
    alanHatasi(hm, er);
    ekodGirdileri().forEach((g) => g.classList.add("hatali"));
    if (er.veri && er.veri.yeniden) epostaAdim(false);
  } finally { dugmeMesgul(d, ""); }
});
$("#epostaVazgec").addEventListener("click", (e) => { e.preventDefault(); epostaJetonu = null; epostaAdim(false); });

$("#sifreForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.currentTarget, d = $("#sifreDugme"), hm = $("#sifreHata");
  hm.hidden = true;
  if (!f.mevcut.value) return alanHatasi(hm, new Error("Mevcut şifreni yaz."));
  if (f.yeni.value.length < 8) return alanHatasi(hm, new Error("Yeni şifre en az 8 karakter olmalı."));
  if (f.yeni.value !== f.tekrar.value) return alanHatasi(hm, new Error("Yeni şifreler aynı değil."));
  if (d.disabled) return;
  dugmeMesgul(d, "Değiştiriliyor…");
  try {
    hesap = await gonder("/api/hesap/sifre", { mevcut: f.mevcut.value, yeni: f.yeni.value });
    f.reset();
    hesapCiz();
    hesabimCiz();
    bildir("Şifren değiştirildi; diğer cihazlardaki oturumların kapandı");
    hesapAnaya("guvenlik");
  } catch (er) { alanHatasi(hm, er); } finally { dugmeMesgul(d, ""); }
});
// üst çubuktaki hesap kartı Hesabım'a götürür (çıkış düğmesi hariç)

// Lemon Squeezy ödeme penceresi: kart bilgisi Lemon Squeezy'nin kendi çerçevesinde girilir, bu sayfaya hiç gelmez.
let lemonSozu = null;
function lemonYukle() {
  if (!lemonSozu) lemonSozu = new Promise((coz, red) => {
    const s = document.createElement("script");
    s.src = "https://app.lemonsqueezy.com/js/lemon.js";
    s.async = true;
    s.onload = () => { try { if (window.createLemonSqueezy) window.createLemonSqueezy(); coz(window.LemonSqueezy); } catch (e) { red(e); } };
    s.onerror = () => { lemonSozu = null; red(new Error("ödeme betiği yüklenemedi")); };
    document.head.append(s);
    setTimeout(() => red(new Error("ödeme betiği gecikti")), 8000);
  });
  return lemonSozu;
}
async function odemePenceresi(adres, plan) {
  let ls;
  try { ls = await lemonYukle(); } catch (e) { ls = null; }
  if (!ls || !ls.Url || !ls.Url.Open) { location.href = adres; return; }    // betik açılmazsa ödeme sayfasına git
  const eskiPlan = hesap && hesap.plan && hesap.plan.id;
  ls.Setup({
    eventHandler: (olay) => {
      if (!olay || olay.event !== "Checkout.Success") return;
      setTimeout(() => { try { ls.Url.Close(); } catch (e) { /* zaten kapalı */ } }, 1800);
      bildir(`Ödeme alındı — ${plan.ad} planın birkaç saniye içinde açılıyor`);
      let n = 0;
      const yokla = setInterval(async () => {                 // plan, ödeme sağlayıcısının web kancasıyla açılır
        n++;
        try {
          const h = await al("/api/ben");
          if (h.plan.id !== eskiPlan || n > 30) {
            clearInterval(yokla);
            hesap = h; hesapCiz(); planlarCiz(); tazele();
            if (h.plan.id !== eskiPlan) bildir(`${h.plan.ad} planın açıldı. Hayırlı olsun!`);
            else bildir("Ödemen alındı; planın birkaç dakika içinde açılacak. Sayfayı sonra yenile.", false);
          }
        } catch (e) { /* bir sonraki denemede */ }
      }, 2000);
    },
  });
  ls.Url.Open(adres);
}

// Stripe ödemeden sonra ?oturum=cs_...#odeme-tamam adresine döner. Plan web kancasıyla açılır; burada yalnız beklenir.
async function odemeSonucu() {
  const oturum = new URLSearchParams(location.search).get("oturum") || "";
  const rozet = $("#sonucRozet"), bas = $("#sonucBaslik"), metin = $("#sonucMetin"), devam = $("#sonucDevam");
  rozet.classList.remove("askida", "tamam");
  devam.hidden = true;
  bas.textContent = "Ödemen kontrol ediliyor…";
  metin.textContent = "Bu birkaç saniye sürer; sayfayı kapatma.";
  if (!oturum) { location.hash = "#planlar"; return; }
  let d;
  try { d = await al("/api/odeme/durum?oturum=" + encodeURIComponent(oturum)); }
  catch (er) { rozet.classList.add("askida"); bas.textContent = "Ödeme durumu alınamadı"; metin.textContent = er.message; return; }
  if (d.durum === "open") {                       // ödeme bitmedi ya da kart reddedildi: formu yeniden aç
    history.replaceState(null, "", location.pathname + "#planlar");
    sayfaGoster();
    bildir("Ödeme tamamlanmadı; Planlar'dan yeniden deneyebilirsin.", false);
    return;
  }
  const eski = hesap && hesap.plan && hesap.plan.id;
  bas.textContent = "Ödemen alındı";
  metin.textContent = "Planın açılıyor…";
  for (let n = 0; n < 30; n++) {
    try {
      const h = await al("/api/ben");
      if (h.plan.id !== eski || (d.plan && h.plan.id === d.plan)) {
        hesap = h; hesapCiz(); tazele();
        rozet.classList.add("tamam");
        bas.textContent = `${h.plan.ad} planın açıldı`;
        metin.textContent = "Teşekkürler! Yeni kademelerin hazır. Makbuz e-postana gönderildi.";
        devam.hidden = false;
        history.replaceState(null, "", location.pathname + "#odeme-tamam");
        return;
      }
    } catch (e) { /* bir sonraki denemede */ }
    await new Promise((x) => setTimeout(x, 2000));
  }
  bas.textContent = "Ödemen alındı";
  metin.textContent = "Planın birkaç dakika içinde açılacak. Açılmazsa sayfayı yenile ya da yöneticiye yaz.";
  devam.hidden = false;
}

$("#odemePortal").addEventListener("click", async (e) => {
  const b = e.currentTarget;
  b.disabled = true;
  try { location.href = (await gonder("/api/odeme/portal")).portal; }   // sağlayıcının müşteri portalı
  catch (er) { bildir(er.message, false); b.disabled = false; }
});

// ---------------------------------------------------------------- yönetim (yalnız yönetici)
let hesaplar = [], hesapFiltre = "bekliyor";
async function bekleyenSay() {
  try {
    hesaplar = await al("/api/yonetim/hesaplar");
    const n = hesaplar.filter((h) => h.durum === "bekliyor").length;
    const r = $("#bekleyenRozet");
    r.hidden = !n;
    r.textContent = n;
  } catch (e) { /* yönetici değil ya da ağ */ }
}
async function yonetimCiz(yeniden = true) {
  if (!hesap || !hesap.yonetici) return;
  if (yeniden) await bekleyenSay();
  const say = (f) => hesaplar.filter(f).length;
  const kart = (ad, deger, alt) => `<div class="kpi"><div class="kpi-ust"><span class="kpi-ad">${ad}</span></div><b>${deger}</b><small>${alt}</small></div>`;
  $("#yonetimSayilar").innerHTML = kart("Toplam hesap", hesaplar.length, "kayıtlı kullanıcı") +
    kart("Onay bekleyen", say((h) => h.durum === "bekliyor"), "senin onayını bekliyor") +
    kart("Aktif", say((h) => h.durum === "aktif"), "sunucu açabilir") +
    kart("Ücretli", say((h) => h.ucretli), "abone kullanıcı");
  const q = ($("#hesapAra").value || "").toLowerCase();
  const l = hesaplar.filter((h) => (hesapFiltre === "hepsi" || h.durum === hesapFiltre) &&
    (!q || [h.ad, h.eposta, h.kadi].some((x) => String(x || "").toLowerCase().includes(q))));
  const planSec = (h) => `<select data-plan-ata="${esc(h.sub)}" aria-label="Plan">${yap.planlar.map((p) => `<option value="${esc(p.id)}" ${p.id === h.plan ? "selected" : ""}>${esc(p.ad)}</option>`).join("")}</select>`;
  const eylem = (h) => {
    if (h.ben) return '<span class="plan-rozet yonetici">sen</span>';
    const d = [];
    if (h.durum === "bekliyor") d.push(`<button class="dugme yesil" data-hesap-is="onayla" data-sub="${esc(h.sub)}">Onayla</button><button class="dugme" data-hesap-is="reddet" data-sub="${esc(h.sub)}">Reddet</button>`);
    else if (h.durum === "aktif") d.push(`<button class="dugme" data-hesap-is="askiya" data-sub="${esc(h.sub)}">Askıya al</button>`);
    else d.push(`<button class="dugme" data-hesap-is="etkinlestir" data-sub="${esc(h.sub)}">Etkinleştir</button>`);
    return planSec(h) + d.join("");
  };
  $("#hesapTablo").innerHTML = `<div class="hesap-satir bas"><span>Kullanıcı</span><span>Durum</span><span>Amaç</span><span>Kayıt</span><span></span></div>` +
    (l.length ? l.map((h) => `<div class="hesap-satir">
      <div class="hesap-kim"><span class="tablo-resim" data-resim="${esc(h.resim)}" data-ad="${esc(h.ad)}"></span><div><b>${esc(h.ad)} <small>@${esc(h.kadi || "—")}</small></b><small>${esc(h.eposta)}${h.giris_turu === "eposta" ? (h.eposta_dogru ? " · e-posta doğrulandı" : " · e-posta doğrulanmadı") : " · Google"}</small>${profilOzeti(h.profil)}</div></div>
      <span><span class="durum-hap ${esc(h.durum)}">${DURUM_AD[h.durum] || esc(h.durum)}</span>${h.istenen_plan ? `<small class="soluk-hucre"> · ${esc((yap.planlar.find((p) => p.id === h.istenen_plan) || {}).ad || "")} istiyor</small>` : ""}</span>
      <span class="soluk-hucre gizle-dar">${esc(AMAC_AD[h.amac] || "—")}</span>
      <span class="soluk-hucre gizle-dar">${esc(tarih(h.olusturma))}</span>
      <div class="hesap-eylem">${eylem(h)}</div></div>`).join("")
      : `<div class="tablo-bos">${hesapFiltre === "bekliyor" ? "Onay bekleyen hesap yok." : "Eşleşen hesap yok."}</div>`);
  $$("#hesapTablo [data-resim]").forEach((k) => resimKoy(k, k.dataset.resim, k.dataset.ad));
}
document.addEventListener("click", async (e) => {
  const f = e.target.closest("#hesapFiltre button");
  if (f) { hesapFiltre = f.dataset.f; $$("#hesapFiltre button").forEach((b) => b.classList.toggle("secili", b === f)); return yonetimCiz(false); }
  const b = e.target.closest("[data-hesap-is]");
  if (!b) return;
  const h = hesaplar.find((x) => x.sub === b.dataset.sub), is = b.dataset.hesapIs;
  if ((is === "askiya" || is === "reddet") && !(await onayla(`${h.ad} ${is === "askiya" ? "askıya alınsın" : "reddedilsin"} mi?`, "Kullanıcı sunucu çalıştıramaz; çalışan sunucuları bir sonraki istekte durur.")))
    return;
  b.disabled = true;
  try {
    await gonder("/api/yonetim/hesap?sub=" + encodeURIComponent(h.sub), { islem: is });
    bildir({ onayla: `${h.ad} onaylandı`, reddet: `${h.ad} reddedildi`, askiya: `${h.ad} askıya alındı`, etkinlestir: `${h.ad} etkinleştirildi` }[is]);
  } catch (er) { bildir(er.message, false); }
  yonetimCiz();
});
document.addEventListener("change", async (e) => {
  const s = e.target.closest("[data-plan-ata]");
  if (!s) return;
  try {
    await gonder("/api/yonetim/hesap?sub=" + encodeURIComponent(s.dataset.planAta), { islem: "plan", plan: s.value });
    bildir("Plan değiştirildi");
  } catch (er) { bildir(er.message, false); }
  yonetimCiz();
});
$("#hesapAra").addEventListener("input", () => yonetimCiz(false));

// ---------------------------------------------------------------- bu cihaz (ziyaretçinin kendi bilgisayarı)
function cihazBilgisi() {
  const n = navigator, ua = n.userAgent || "";
  let gpu = "";
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const d = gl && gl.getExtension("WEBGL_debug_renderer_info");
    gpu = gl ? String(gl.getParameter(d ? d.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : "";
    const m = gpu.match(/ANGLE \([^,]+,\s*([^,]+?)(?:\s*\(0x[0-9a-f]+\))?\s*(?:Direct3D|OpenGL|Vulkan|Metal|,|$)/i);
    if (m) gpu = m[1];
    gpu = gpu.replace(/\s+/g, " ").trim();
  } catch (e) { /* WebGL kapalı */ }
  const ud = n.userAgentData;
  const isletim = (ud && ud.platform) || (/Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "—");
  let tarayici = "—";
  if (ud && ud.brands) { const b = ud.brands.find((x) => !/Not.?A.?Brand|Chromium/i.test(x.brand)) || ud.brands[0]; if (b) tarayici = `${b.brand} ${b.version}`; }
  else { const m = ua.match(/(Firefox|Edg|OPR|Chrome|Safari)\/(\d+)/); if (m) tarayici = `${{ Edg: "Edge", OPR: "Opera" }[m[1]] || m[1]} ${m[2]}`; }
  const cekirdek = n.hardwareConcurrency || 1, ram = n.deviceMemory || 0;
  const kademe = cekirdek <= 2 ? 1 : cekirdek <= 8 ? 2 : cekirdek <= 16 ? 3 : cekirdek <= 64 ? 4 : 5;
  return { gpu, isletim, tarayici, cekirdek, ram, kademe, ekran: `${screen.width}×${screen.height}${devicePixelRatio > 1 ? ` · ${devicePixelRatio}x` : ""}`, dil: n.language };
}
function cihazCiz() {
  const c = cihazBilgisi();
  const k = KADEMELER[c.kademe - 1];
  $("#cihazCizim").innerHTML = cipCizimi({ çekirdek: c.cekirdek, işçi: c.cekirdek, ram_mb: (c.ram || 4) * 1024, kademe: c.kademe, sanal_işlemci: k.cpu, simd: c.isletim });
  $("#cihazAlt").textContent = c.gpu || c.isletim;
  $("#cihazListe").innerHTML = [
    ["İşletim sistemi", c.isletim], ["Tarayıcı", c.tarayici], ["İşlemci çekirdeği", c.cekirdek + " mantıksal"],
    ["Bellek", c.ram ? (c.ram >= 8 ? "8 GB ya da daha fazla" : c.ram + " GB") : "tarayıcı söylemiyor"],
    ["Ekran kartı", c.gpu || "tarayıcı söylemiyor"], ["Ekran", c.ekran],
    ["Benzer kademe", `Tier ${c.kademe} · ${k.sinif}`], ["Sanal karşılığı", `${k.cpu} + ${k.gpu}`],
  ].map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join("");
  if (!ozet) {
    $("#cipCizim").innerHTML = `<div class="bos-durum">${BOS_CIZIM}<b>Bulut düğümü bekleniyor</b><p>Sunucu bağlanınca makinelerinin çalıştığı düğümün işlemcisi ve kademesi burada görünür.</p></div>`;
    $("#donanimListe").innerHTML = "";
    $("#cipAlt").textContent = "henüz bağlı değil";
  }
}

async function gunlukTazele() {
  const ad = $("#gunlukSecim").value;
  const pre = $("#gunlukMetin");
  if (!ad) { pre.innerHTML = '<span class="bos-satir">Günlüğü görmek için önce bir sunucu oluştur.</span>'; $("#gunlukBaslik").textContent = "—"; $("#gunlukSayac").textContent = ""; return; }
  gunlukAd = ad;
  try {
    const j = await al("/api/gunluk?ad=" + encodeURIComponent(ad) + "&n=500");
    const q = ($("#gunlukSuz").value || "").toLowerCase();
    const satirlar = j.satırlar.filter((s) => !q || s.toLowerCase().includes(q));
    const rx = q ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi") : null;
    pre.innerHTML = satirlar.length ? satirlar.map((s) => {
      const sinif = s.startsWith("=== ") ? "vm" : /lanet|hata|error|curse/i.test(s) ? "hata" : /uyarı|warning/i.test(s) ? "uyari" : "";
      let h = esc(gizle(s));
      if (rx) h = h.replace(rx, (m) => `<mark>${m}</mark>`);
      return `<span class="l ${sinif}">${h || " "}</span>`;
    }).join("") : `<span class="bos-satir">${q ? "Aramayla eşleşen satır yok." : "Günlük henüz boş."}</span>`;
    $("#gunlukBaslik").textContent = ad + ".log";
    $("#gunlukSayac").textContent = `${satirlar.length} / ${j.toplam || 0} satır`;
    if ($("#otoKaydir").checked) pre.scrollTop = pre.scrollHeight;
  } catch (e) { /* bir sonraki tazelemede yeniden denenir */ }
}

// ---------------------------------------------------------------- yönlendirme
// Hesabım açıkken sol menü kapanır, yerine Hesabım kategorileri (hsNav) gelir; çıkınca menü geri döner.
// hsNav taşınır (kopyalanmaz): bağlı olaylar ve "etkin" işaretleri olduğu gibi kalır.
let hsNavYuva = null;
function rayHesapModu(acik) {
  const kabuk = $(".kabuk"), nav = $("#hsNav"), ray = $("#rayHesap");
  if (!hsNavYuva) hsNavYuva = { ebeveyn: nav.parentElement, sonraki: nav.nextElementSibling };
  if (acik === kabuk.classList.contains("hesap-modu")) return;
  kabuk.classList.toggle("hesap-modu", acik);
  ray.hidden = !acik;
  if (acik) ray.append(nav);
  else hsNavYuva.ebeveyn.insertBefore(nav, hsNavYuva.sonraki);
}
$("#rayGeri").addEventListener("click", (e) => {
  e.preventDefault();
  const onceki = sessionStorage.getItem("mscriptvm-hesap-oncesi") || "#genel";
  location.hash = onceki.startsWith("#hesabim") ? "#genel" : onceki;
});
window.addEventListener("hashchange", (e) => {        // Hesabım'a girmeden önceki sayfa: "Panele dön" oraya götürür
  try {
    const eski = new URL(e.oldURL).hash || "#genel", yeni = new URL(e.newURL).hash;
    if (yeni.startsWith("#hesabim") && !eski.startsWith("#hesabim")) sessionStorage.setItem("mscriptvm-hesap-oncesi", eski);
  } catch (er) { /* özel pencere */ }
});

function sayfaGoster() {
  let s = (location.hash || "#genel").slice(1).split("/")[0];
  if (s === "kademeler") s = BULUT && hesap ? "planlar" : "donanim";   // kademeler artık Planlar sayfasının altında
  if (!SAYFA_AD[s]) s = "genel";
  let defterIcin = "";                 // #defter/<makine adı>
  if (s === "defter") { try { defterIcin = decodeURIComponent(location.hash.slice(8)); } catch (e) { /* bozuk adres */ } if (!defterIcin) s = "makineler"; }
  if (((s === "planlar" || s === "hesabim" || s === "odeme-tamam") && (!BULUT || !hesap)) || (s === "yonetim" && !(hesap && hesap.yonetici))) s = "genel";
  rayHesapModu(s === "hesabim");
  $$("section[data-bolum]").forEach((b) => (b.hidden = b.dataset.bolum !== s));
  $$(".ray a[data-sayfa]").forEach((a) => a.classList.toggle("etkin", a.dataset.sayfa === (s === "defter" ? "makineler" : s)));
  $("#sayfaBaslik").textContent = s === "defter" ? `${defterIcin} · ${SAYFA_AD[s]}` : SAYFA_AD[s];
  document.title = `${s === "defter" ? defterIcin + " · " : ""}${SAYFA_AD[s]} · MegscriptVM`;
  if (typeof defterSayfasi === "function") { if (s === "defter") defterSayfasi(defterIcin); else defterKapat(); }
  if (s === "gunlukler") gunlukTazele();
  if (s === "planlar") planlarCiz();
  if (s === "hesabim") { hesabimCiz(); hesapRota(location.hash.split("/").slice(1)); }
  if (s === "guncellemeler") guncellemelerCiz();
  if (s === "blog") blogCiz(location.hash.slice(6));
  hesapMenuKapat();
  if (s === "odeme-tamam") odemeSonucu();
  if (s === "yonetim") yonetimCiz();
  if (s === "donanim") cihazCiz();
  window.scrollTo({ top: 0 });
}

// ---------------------------------------------------------------- yeni sunucu / ayarlar çekmecesi
// Kod burada yazılmaz: sunucu boş bir kod defteriyle (zorunlu altyapı + bir kod hücresi) kurulur ve defter açılır.
// Kademe seçtirilmez: bulutta planın serbest en üst kademesi, yerelde ve yöneticide düğüme göre otomatik.
const BOS_DEFTER = "--%% altyapı\n--%% hücre: hücre-1\n";
let duzenlenenKod = "";
// ---------------------------------------------------------------- sanal donanım seçimi (ekran kartı + işlemci)
// Motor sunucunun kademesini ikisinin büyüğü sayar; her biri planda serbest ya da kotalı olmalı.
let seciliGpu = 1, seciliCpu = 1;
const KILIT_IKON = '<svg viewBox="0 0 24 24"><path d="M7 11V8a5 5 0 0110 0v3M5 11h14v10H5z"/></svg>';
function tierDurumu(n) {
  const p = planSiniri();
  if (!p || p.yonetici) return "acik";
  if (n <= (p.t || 1)) return "acik";
  if (p.q && n === p.q) return "kota";
  return "kilitli";
}
function varsayilanTier() {
  const p = planSiniri();
  if (!p) return Math.max(1, ozet ? ozet.ana_makine.kademe || 1 : 1);
  return p.yonetici ? 3 : p.t || 1;
}
function donanimCiz() {
  const p = planSiniri();
  const satir = (tur, k) => {
    const d = tierDurumu(k.n), sec = (tur === "gpu" ? seciliGpu : seciliCpu) === k.n;
    const ad = tur === "gpu" ? k.gpu : k.cpu;
    const ozellik = tur === "gpu" ? `VRAM ${k.vram} · ${k.sinif}` : `${k.vcpu} · ${k.isci}`;
    const rozet = d === "kota" ? `ayda ${saat(p.qs)} sa` : d === "kilitli" ? "yükselt" : p && p.yonetici ? "ücretsiz" : p ? "planında" : "";
    return `<button type="button" role="radio" aria-checked="${sec}" class="ds-satir ${d} ${sec ? "secili" : ""}" data-tur="${tur}" data-n="${k.n}">
      <span class="ds-tier">T${k.n}</span><span class="ds-ad"><b>${esc(ad)}</b><small>${esc(ozellik)}</small></span>
      ${rozet ? `<span class="ds-rozet ${d}">${d === "kilitli" ? KILIT_IKON : ""}${rozet}</span>` : ""}</button>`;
  };
  $("#gpuSec").innerHTML = KADEMELER.map((k) => satir("gpu", k)).join("");
  $("#cpuSec").innerHTML = KADEMELER.map((k) => satir("cpu", k)).join("");
  // kapalıyken başlığın altında seçili kart görünür; tıklayınca seçenekler altında açılır
  for (const tur of ["gpu", "cpu"]) {
    const n = tur === "gpu" ? seciliGpu : seciliCpu, k = KADEMELER[n - 1], acik = !$(`#${tur}Sec`).hidden;
    $(`#${tur}Secili`).innerHTML = `<span class="ds-tier">T${n}</span><span class="ds-ad"><b>${esc(tur === "gpu" ? k.gpu : k.cpu)}</b>
      <small>${esc(tur === "gpu" ? `VRAM ${k.vram} · ${k.sinif}` : `${k.vcpu} · ${k.isci}`)}</small></span>
      <span class="ds-degis">${acik ? "Kapat" : "Değiştir"}<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></span>`;
    $(`#${tur}Secili`).setAttribute("aria-expanded", String(acik));
    $(`#${tur}Secili`).classList.toggle("acik", acik);
  }
  const et = Math.max(seciliGpu, seciliCpu), g = KADEMELER[seciliGpu - 1], c = KADEMELER[seciliCpu - 1];
  $("#dsOzet").innerHTML = `<span>Seçimin</span><b>${esc(g.gpu)}</b><i>+</i><b>${esc(c.cpu)}</b><em>Tier ${et}</em>` +
    (tierDurumu(et) === "kota" ? `<small>Bu sunucunun çalıştığı süre bu ayki Tier ${et} kotandan düşer.</small>` : "");
}
function donanimListesi(tur, ac) {
  for (const t of ["oyun", "gpu", "cpu"]) $(`#${t}Sec`).hidden = t === tur ? !ac : true;   // aynı anda tek liste açık
  donanimCiz();
  oyunCiz();
}

// ---------------------------------------------------------------- oyun seçimi: oyunun standart (varsayılan) portu
// Portlar oyunların resmi sunucularının varsayılanıdır; sunucu ayarında değiştirilebilir. Kod yine kullanıcınındır.
// tur: listede gruplama ve arama için. mc: Minecraft (korsan/çevrim dışı mod seçeneği çıkar).
const OYUNLAR = [
  { id: "ozel", ad: "Kendi oyunum / özel", port: 0, not: "Portu kendin yaz (ya da boş bırak)", tur: "Genel" },
  { id: "msp", ad: "MSP oyun sunucusu (mscript)", port: 7777, not: "TCP 7777 · Unity, GameMaker, RPG Maker", tur: "Genel" },
  { id: "web", ad: "Web / HTTP sunucusu", port: 8080, not: "TCP 8080 · web oyunları, API, WebSocket", tur: "Genel" },
  { id: "mc-java", ad: "Minecraft: Java Edition", port: 25565, not: "TCP 25565 · Paper, Spigot, Forge, Fabric", tur: "Hayatta kalma", mc: true },
  { id: "mc-bedrock", ad: "Minecraft: Bedrock Edition", port: 19132, not: "UDP 19132 · telefon, konsol, Windows", tur: "Hayatta kalma", mc: true },
  { id: "terraria", ad: "Terraria", port: 7777, not: "TCP 7777", tur: "Hayatta kalma" },
  { id: "valheim", ad: "Valheim", port: 2456, not: "UDP 2456–2457", tur: "Hayatta kalma" },
  { id: "rust", ad: "Rust", port: 28015, not: "UDP 28015", tur: "Hayatta kalma" },
  { id: "ark", ad: "ARK: Survival Evolved", port: 7777, not: "UDP 7777 (+ sorgu 27015)", tur: "Hayatta kalma" },
  { id: "palworld", ad: "Palworld", port: 8211, not: "UDP 8211", tur: "Hayatta kalma" },
  { id: "7dtd", ad: "7 Days to Die", port: 26900, not: "TCP/UDP 26900", tur: "Hayatta kalma" },
  { id: "pz", ad: "Project Zomboid", port: 16261, not: "UDP 16261", tur: "Hayatta kalma" },
  { id: "dst", ad: "Don’t Starve Together", port: 10999, not: "UDP 10999", tur: "Hayatta kalma" },
  { id: "unturned", ad: "Unturned", port: 27015, not: "UDP 27015", tur: "Hayatta kalma" },
  { id: "conan", ad: "Conan Exiles", port: 7777, not: "UDP 7777", tur: "Hayatta kalma" },
  { id: "enshrouded", ad: "Enshrouded", port: 15636, not: "UDP 15636–15637", tur: "Hayatta kalma" },
  { id: "vrising", ad: "V Rising", port: 9876, not: "UDP 9876", tur: "Hayatta kalma" },
  { id: "sotf", ad: "Sons of the Forest", port: 8766, not: "UDP 8766", tur: "Hayatta kalma" },
  { id: "icarus", ad: "Icarus", port: 17777, not: "UDP 17777", tur: "Hayatta kalma" },
  { id: "dayz", ad: "DayZ", port: 2302, not: "UDP 2302", tur: "Hayatta kalma" },
  { id: "hurtworld", ad: "Hurtworld", port: 12871, not: "UDP 12871", tur: "Hayatta kalma" },
  { id: "luanti", ad: "Luanti (Minetest)", port: 30000, not: "UDP 30000", tur: "Hayatta kalma" },
  { id: "vintage", ad: "Vintage Story", port: 42420, not: "TCP 42420", tur: "Hayatta kalma" },
  { id: "necesse", ad: "Necesse", port: 14159, not: "UDP 14159", tur: "Hayatta kalma" },
  { id: "starbound", ad: "Starbound", port: 21025, not: "TCP 21025", tur: "Hayatta kalma" },
  { id: "factorio", ad: "Factorio", port: 34197, not: "UDP 34197", tur: "İnşa ve strateji" },
  { id: "satisfactory", ad: "Satisfactory", port: 7777, not: "UDP/TCP 7777", tur: "İnşa ve strateji" },
  { id: "space-eng", ad: "Space Engineers", port: 27016, not: "UDP 27016", tur: "İnşa ve strateji" },
  { id: "mindustry", ad: "Mindustry", port: 6567, not: "TCP/UDP 6567", tur: "İnşa ve strateji" },
  { id: "openttd", ad: "OpenTTD", port: 3979, not: "TCP/UDP 3979", tur: "İnşa ve strateji" },
  { id: "eco", ad: "Eco", port: 3000, not: "UDP 3000", tur: "İnşa ve strateji" },
  { id: "stardew", ad: "Stardew Valley", port: 24642, not: "UDP 24642", tur: "İnşa ve strateji" },
  { id: "barotrauma", ad: "Barotrauma", port: 27015, not: "UDP 27015", tur: "İnşa ve strateji" },
  { id: "cs2", ad: "Counter-Strike 2", port: 27015, not: "UDP/TCP 27015", tur: "Nişancı" },
  { id: "tf2", ad: "Team Fortress 2", port: 27015, not: "UDP/TCP 27015", tur: "Nişancı" },
  { id: "l4d2", ad: "Left 4 Dead 2", port: 27015, not: "UDP/TCP 27015", tur: "Nişancı" },
  { id: "gmod", ad: "Garry’s Mod", port: 27015, not: "UDP 27015", tur: "Nişancı" },
  { id: "arma3", ad: "Arma 3", port: 2302, not: "UDP 2302", tur: "Nişancı" },
  { id: "squad", ad: "Squad", port: 7787, not: "UDP 7787", tur: "Nişancı" },
  { id: "kf2", ad: "Killing Floor 2", port: 7777, not: "UDP 7777", tur: "Nişancı" },
  { id: "q3", ad: "Quake III Arena", port: 27960, not: "UDP 27960", tur: "Nişancı" },
  { id: "teeworlds", ad: "Teeworlds / DDNet", port: 8303, not: "UDP 8303", tur: "Nişancı" },
  { id: "fivem", ad: "GTA V · FiveM", port: 30120, not: "TCP/UDP 30120", tur: "Rol yapma" },
  { id: "ragemp", ad: "GTA V · RAGE:MP", port: 22005, not: "UDP 22005", tur: "Rol yapma" },
  { id: "samp", ad: "GTA San Andreas · SA-MP / open.mp", port: 7777, not: "UDP 7777", tur: "Rol yapma" },
  { id: "bannerlord", ad: "Mount & Blade II: Bannerlord", port: 7210, not: "UDP 7210", tur: "Rol yapma" },
  { id: "among-us", ad: "Among Us (Impostor)", port: 22023, not: "UDP 22023", tur: "Parti" },
  { id: "ets2", ad: "Euro Truck Simulator 2", port: 27015, not: "UDP 27015", tur: "Yarış ve simülasyon" },
  { id: "ats", ad: "American Truck Simulator", port: 27015, not: "UDP 27015", tur: "Yarış ve simülasyon" },
  { id: "assetto", ad: "Assetto Corsa", port: 9600, not: "TCP/UDP 9600 (+ HTTP 8081)", tur: "Yarış ve simülasyon" },
];
let seciliOyun = "ozel";
const oyunBul = (id) => OYUNLAR.find((o) => o.id === id) || OYUNLAR[0];
const oyunHarf = (o) => (o.id === "ozel" ? "✎" : o.ad.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase());
const aramaMetni = (s) => String(s).toLocaleLowerCase("tr").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i");
function oyunCiz() {
  const s = oyunBul(seciliOyun), acik = !$("#oyunSec").hidden, q = aramaMetni($("#oyunAra").value.trim());
  const liste = OYUNLAR.filter((o) => !q || aramaMetni(`${o.ad} ${o.not} ${o.tur} ${o.port}`).includes(q));
  let tur = "";
  $("#oyunListe").innerHTML = liste.length ? liste.map((o) => {
    const bas = o.tur !== tur && !q ? `<div class="ds-grup">${esc((tur = o.tur))}</div>` : "";
    return bas + `<button type="button" role="radio" aria-checked="${o.id === seciliOyun}" class="ds-satir oyun-satir acik ${o.id === seciliOyun ? "secili" : ""}" data-oyun="${o.id}">
      <span class="ds-tier">${esc(oyunHarf(o))}</span><span class="ds-ad"><b>${esc(o.ad)}</b><small>${esc(o.not)}</small></span>
      ${o.port ? `<span class="ds-rozet port">${o.port}</span>` : ""}</button>`;
  }).join("") : `<p class="ds-bos">“${esc($("#oyunAra").value.trim())}” bulunamadı. Listede yoksa “Kendi oyunum / özel”i seçip portu kendin yaz.</p>`;
  $("#oyunSecili").innerHTML = `<span class="ds-tier">${esc(oyunHarf(s))}</span><span class="ds-ad"><b>${esc(s.ad)}</b><small>${esc(s.not)}</small></span>
    <span class="ds-degis">${acik ? "Kapat" : "Değiştir"}<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></span>`;
  $("#oyunSecili").setAttribute("aria-expanded", String(acik));
  $("#oyunSecili").classList.toggle("acik", acik);
  $("#korsanSecenek").hidden = !s.mc;
}
$("#oyunAra").addEventListener("input", oyunCiz);
$("#oyunAra").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); const b = $("#oyunListe .oyun-satir"); if (b) oyunSec(b.dataset.oyun); }
  if (e.key === "Escape") { e.stopPropagation(); donanimListesi("oyun", false); }
});
// Port önerisi: oyunun varsayılanı; kendi sunucularından biri kullanıyorsa bir sonraki boş port.
function bosPort(p) {
  const dolu = new Set(ornekler.filter((o) => o.ad !== duzenlenen).map((o) => +o.port).filter(Boolean));
  while (p && dolu.has(p) && p < 65535) p++;
  return p;
}
function oyunSec(id) {
  seciliOyun = id;
  const o = oyunBul(id), f = $("#olusturForm");
  if (o.port) {
    const p = bosPort(o.port);
    f.port.value = p;
    $("#portIpucu").textContent = p === o.port
      ? `${o.ad} standart portu: ${o.not}. İstersen değiştirebilirsin.`
      : `${o.ad} standart portu ${o.port} başka sunucunda kullanılıyor; boş olan ${p} yazıldı.`;
  } else {
    $("#portIpucu").textContent = "Oyuncular sunucuna bu porttan bağlanır. Boş bırakırsan sunucu port açmaz.";
  }
  if (o.id !== "ozel" && !f.not.value.trim()) { f.not.value = `${o.ad} sunucusu`; notSay(); }
  $("#oyunAra").value = "";
  donanimListesi("oyun", false);
}
// Yeni sunucunun defteri: oyun seçildiyse altyapı hücresine oyun, port ve (Minecraft'ta) çevrim dışı mod yazılır.
function yeniDefter() {
  const o = oyunBul(seciliOyun), f = $("#olusturForm");
  if (o.id === "ozel") return BOS_DEFTER;
  const satir = [`-- Oyun: ${o.ad} · standart port ${o.not} (kodda port: sistem.argümanlar[0])`];
  if (o.mc) {
    const k = f.korsan.checked;
    satir.push(`mühür ÇEVRİMDIŞI_MOD = ${k ? "gerçek" : "yalan"}   -- ${k ? "korsan istemciler (TLauncher vb.) girebilir; hesap doğrulanmaz" : "yalnız resmî hesaplar; hesap doğrulamasını kodun yapmalı"}`);
  }
  return `--%% altyapı\n${satir.join("\n")}\n--%% hücre: hücre-1\n`;
}

document.addEventListener("click", (e) => {
  const a = e.target.closest(".ds-ac");
  if (a) return donanimListesi(a.dataset.acTur, $(`#${a.dataset.acTur}Sec`).hidden);
  const oy = e.target.closest(".oyun-satir");
  if (oy) return oyunSec(oy.dataset.oyun);
  const s = e.target.closest(".ds-satir");
  if (!s) return;
  const n = +s.dataset.n;
  if (s.classList.contains("kilitli")) {
    // kutu yok: satır kısaca sallanır, rozeti "planında yok" olur, köşede kısa bir bildirim çıkar
    const rozet = s.querySelector(".ds-rozet");
    s.classList.remove("salla");
    void s.offsetWidth;                       // animasyonu baştan başlat
    s.classList.add("salla");
    if (rozet) {
      rozet.innerHTML = KILIT_IKON + "planında yok";
      clearTimeout(s._geri);
      s._geri = setTimeout(() => { rozet.innerHTML = KILIT_IKON + "yükselt"; s.classList.remove("salla"); }, 1600);
    }
    bildir(`${s.dataset.tur === "gpu" ? KADEMELER[n - 1].gpu : KADEMELER[n - 1].cpu} (Tier ${n}) planında yok`, false);
    return;
  }
  if (s.dataset.tur === "gpu") seciliGpu = n; else seciliCpu = n;
  donanimListesi(s.dataset.tur, false);       // seçince liste kapanır
});

function notSay() {
  const f = $("#olusturForm");
  $("#notSayac").textContent = `${f.not.value.length} / 200`;
}
$("#olusturForm").not.addEventListener("input", notSay);

function cekmeceGoster() {
  $("#olusturHata").hidden = true;
  $("#perde").hidden = false;
  $("#cekmece").classList.add("acik");
  $("#cekmece").setAttribute("aria-hidden", "false");
}
function cekmeceAc() {
  const f = $("#olusturForm");
  f.reset();
  duzenlenen = null;
  duzenlenenKod = "";
  f.ad.readOnly = false;
  $("#cekmeceBaslik").textContent = "Yeni sunucu";
  $("#cekmeceAlt").textContent = "Ad ver, ekran kartını ve işlemcini seç. Kodunu sunucunun kod defterinde yazacaksın.";
  $("#adIpucu").textContent = "Harf, rakam, _ ve - kullanabilirsin. Ad sonradan değiştirilemez.";
  $("#olusturDugme span").textContent = "Oluştur ve defteri aç";
  seciliGpu = seciliCpu = varsayilanTier();
  $("#gpuSec").hidden = $("#cpuSec").hidden = $("#oyunSec").hidden = true;
  seciliOyun = "ozel";
  $("#portIpucu").textContent = "Oyuncular sunucuna bu porttan bağlanır. Boş bırakırsan sunucu port açmaz.";
  oyunCiz();
  donanimCiz();
  notSay();
  cekmeceGoster();
  setTimeout(() => f.ad.focus(), 250);
}
async function duzenlemeAc(ad) {
  const o = ornekler.find((x) => x.ad === ad);
  if (!o) return;
  try { duzenlenenKod = (await al("/api/kod?ad=" + encodeURIComponent(ad))).kod; } catch (er) { return bildir(er.message, false); }
  const f = $("#olusturForm");
  f.reset();
  duzenlenen = ad;
  f.ad.value = ad;
  f.ad.readOnly = true;
  f.port.value = o.port || "";
  f.not.value = o.not || "";
  f.otomatik.checked = !!o.otomatik;
  $("#cekmeceBaslik").textContent = `${ad} · ayarlar`;
  $("#cekmeceAlt").textContent = o.durum === "çalışıyor" ? "Kaydedince sunucu yeni ayarlarla yeniden başlar." : "Değişiklikler bir sonraki başlatmada geçerli olur.";
  $("#adIpucu").textContent = "Sunucunun adı değiştirilemez.";
  $("#olusturDugme span").textContent = "Kaydet";
  seciliGpu = o.kademe || varsayilanTier();
  seciliCpu = o.işlemci || seciliGpu;
  $("#gpuSec").hidden = $("#cpuSec").hidden = $("#oyunSec").hidden = true;
  seciliOyun = "ozel";
  $("#portIpucu").textContent = "Oyuncular sunucuna bu porttan bağlanır. Boş bırakırsan sunucu port açmaz.";
  oyunCiz();
  donanimCiz();
  notSay();
  cekmeceGoster();
  setTimeout(() => f.port.focus(), 250);
}
function cekmeceKapat() {
  $("#perde").hidden = true;
  $("#cekmece").classList.remove("acik");
  $("#cekmece").setAttribute("aria-hidden", "true");
}

// ---------------------------------------------------------------- olaylar
document.addEventListener("click", async (e) => {
  if (e.target.closest("[data-ac='olustur']")) return cekmeceAc();
  if (e.target.closest("[data-kapat]") || e.target === $("#perde")) return cekmeceKapat();
  if (e.target.closest("#yenidenDene")) return tazele();
  const fl = e.target.closest("#durumFiltre button");
  if (fl) { filtre = fl.dataset.f; $$("#durumFiltre button").forEach((b) => b.classList.toggle("secili", b === fl)); return makinelerCiz(); }
  const is = e.target.closest("[data-is]");
  if (is) {
    const ad = is.closest("[data-ad]").dataset.ad, ne = is.dataset.is;
    if (ne === "duzenle") { location.hash = "#defter/" + encodeURIComponent(ad); return; }
    if (ne === "gunluk") { gunlukAd = ad; location.hash = "#gunlukler"; $("#gunlukSecim").value = ad; return gunlukTazele(); }
    if (ne === "sil" && !(await onayla(`${ad} silinsin mi?`, "Sunucu durdurulur ve listeden kaldırılır. Kodu ve günlüğü diskte kalır."))) return;
    is.disabled = true;
    try {
      await gonder(`/api/${ne}?ad=${encodeURIComponent(ad)}`);
      bildir({ baslat: `${ad} başlatıldı`, durdur: `${ad} durduruldu`, yeniden: `${ad} yeniden başlatıldı`, sil: `${ad} silindi` }[ne]);
    } catch (er) { bildir(er.message, false); }
    tazele();
  }
});
document.addEventListener("change", async (e) => {
  if (e.target.matches("[data-oto]")) {
    const ad = e.target.closest("[data-ad]").dataset.ad;
    try {
      await gonder(`/api/otomatik?ad=${encodeURIComponent(ad)}&deger=${e.target.checked ? 1 : 0}`);
      bildir(`${ad}: bekçi ${e.target.checked ? "açık" : "kapalı"}`);
    } catch (er) { bildir(er.message, false); }
  }
  if (e.target.id === "gunlukSecim") gunlukTazele();
});
$("#aramaKutusu").addEventListener("input", makinelerCiz);
$("#gunlukSuz").addEventListener("input", gunlukTazele);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { cekmeceKapat(); $("#onayModal").hidden = true; } });

$("#olusturForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target, d = $("#olusturDugme"), h = $("#olusturHata");
  h.hidden = true;
  const ad = f.ad.value.trim();
  if (!duzenlenen && !/^[A-Za-z0-9_\-çğıöşüÇĞİÖŞÜ]{1,32}$/.test(ad)) { h.textContent = "Ad 1–32 karakter olmalı: harf, rakam, _ ve -."; h.hidden = false; f.ad.focus(); return; }
  const ortak = { port: f.port.value || 0, not: f.not.value.trim(), otomatik: f.otomatik.checked ? 1 : 0 };
  d.disabled = true;
  try {
    if (duzenlenen) {
      const o = ornekler.find((x) => x.ad === duzenlenen) || {};
      await gonder(`/api/guncelle?ad=${encodeURIComponent(duzenlenen)}`, {
        ...ortak, kod: duzenlenenKod, kademe: seciliGpu, işlemci: seciliCpu, politika: o.politika || "katı",
      });
      bildir(`${duzenlenen} ayarları kaydedildi`);
      if (typeof defterYenile === "function" && location.hash.startsWith("#defter/")) defterYenile();
    } else {
      await gonder("/api/olustur", { ...ortak, ad, kod: yeniDefter(), kademe: seciliGpu, işlemci: seciliCpu, politika: "katı", başlat: 0 });
      bildir(`${ad} oluşturuldu; kodunu defterde yaz`);
      location.hash = "#defter/" + encodeURIComponent(ad);   // yeni sunucunun kod defteri
    }
    cekmeceKapat();
    tazele();
  } catch (er) {
    h.textContent = er.message;
    h.hidden = false;
  } finally { d.disabled = false; }
});

// ---------------------------------------------------------------- hesap menüsü (Google hesabı gibi: simgeye tıkla)
const uyelikGunu = () => (hesap && hesap.olusturma ? Math.max(1, Math.floor((Date.now() - new Date(hesap.olusturma)) / 864e5) + 1) : 0);
function hesapMenuCiz() {
  if (!hesap) return;
  const ad = (hesap.ad || hesap.eposta || "").trim();
  $("#hmEposta").textContent = hesap.eposta;
  resimKoy($("#hmResim"), hesap.resim, ad);
  $("#hmMerhaba").textContent = `Merhaba, ${ad.split(/\s+/)[0] || "dostum"}!`;
  $("#hmPlan").innerHTML = planRozeti(hesap) + (hesap.kadi ? ` <span class="soluk">@${esc(hesap.kadi)}</span>` : "");
  $("#hmMakine").textContent = ornekler.length;
  $("#hmCalisan").textContent = ornekler.filter((o) => o.durum === "çalışıyor").length;
  $("#hmGun").textContent = uyelikGunu();
  $("#hmSurum").textContent = ozet ? `MegscriptVM ${ozet.sürüm}` : "MegscriptVM";
  let gorulen = "";
  try { gorulen = localStorage.getItem("mscriptvm-son-gorulen-surum") || ""; } catch (e) { /* özel pencere */ }
  const yeni = typeof GUNCEL !== "undefined" && GUNCEL[0] && gorulen !== GUNCEL[0].surum;
  $("#hmYeni").hidden = !yeni;
  const bek = $("#bekleyenRozet");
  $("#hmBekleyen").hidden = !bek || bek.hidden;
  if (bek) $("#hmBekleyen").textContent = bek.textContent;
  $("#hesapNokta").hidden = !(yeni || (bek && !bek.hidden) || hesap.eposta_dogru === false);
  temaSecCiz();
}
function hesapMenuAc() {
  hesapMenuCiz();
  $("#hesapMenu").hidden = false;
  $("#hesapDugme").setAttribute("aria-expanded", "true");
}
function hesapMenuKapat() {
  const m = $("#hesapMenu");
  if (!m || m.hidden) return;
  m.hidden = true;
  $("#hesapDugme").setAttribute("aria-expanded", "false");
}
$("#hesapDugme").addEventListener("click", (e) => {
  e.stopPropagation();
  if ($("#hesapMenu").hidden) hesapMenuAc(); else hesapMenuKapat();
});
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-hm]")) return hesapMenuKapat();
  if (!e.target.closest("#hesapMenu")) hesapMenuKapat();
});

// ---------------------------------------------------------------- tema: koyu / açık / sistem
function temaModu() {
  let t = null;
  try { t = localStorage.getItem("mscriptvm-tema"); } catch (e) { /* özel pencere */ }
  return t === "acik" || t === "koyu" ? t : "sistem";
}
function temaSec(m) {
  if (m === "sistem") {
    delete document.documentElement.dataset.tema;     // stil.css sistem tercihini izler
    try { localStorage.setItem("mscriptvm-tema", "sistem"); } catch (e) { /* özel pencere */ }
  } else temaUygula(m);
  temaSecCiz();
}
function temaSecCiz() {
  const m = temaModu();
  $$("[data-tema-sec]").forEach((b) => b.classList.toggle("secili", b.dataset.temaSec === m));
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-tema-sec]");
  if (b) temaSec(b.dataset.temaSec);
});

// ---------------------------------------------------------------- Hesabım: özet, güvenlik, rozetler, veriler
const sureUzun = (sn) => { const s = Math.floor(sn / 3600), d = Math.floor((sn % 3600) / 60); return s ? `${s} sa ${d} dk` : `${d} dk`; };
const tarihSaat = (s) => { try { return new Date(s).toLocaleString("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }); } catch (e) { return "—"; } };
const ROZETLER = [
  { ad: "Hoş geldin", ac: "Hesabını açtın", kosul: () => true, ikon: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" },
  { ad: "Doğrulanmış", ac: "E-postanı doğruladın", kosul: (h) => h.eposta_dogru !== false, ikon: "M5 12.5l4.5 4.5L19 7.5" },
  { ad: "İlk sunucu", ac: "İlk sunucunu kurdun", kosul: () => ornekler.length >= 1, ikon: "M4 4.5h16v6H4zM4 13.5h16v6H4z" },
  { ad: "Ayakta", ac: "Bir sunucun şu an çalışıyor", kosul: () => ornekler.some((o) => o.durum === "çalışıyor"), ikon: "M13 3L5 13h6l-1 8 8-10h-6z" },
  { ad: "Gece nöbeti", ac: "Bir sunucun 24 saattir aralıksız açık", kosul: () => ornekler.some((o) => o.süre_sn >= 86400), ikon: "M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z" },
  { ad: "Filo", ac: "3 ya da daha çok sunucun var", kosul: () => ornekler.length >= 3, ikon: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" },
  { ad: "Bekçili", ac: "Bütün sunucularında 7/24 bekçi açık", kosul: () => ornekler.length > 0 && ornekler.every((o) => o.otomatik), ikon: "M12 3l7 3v6c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6z" },
  { ad: "Destekçi", ac: "Ücretli bir plandasın", kosul: (h) => !!(h.plan && h.plan.fiyat) || h.yonetici, ikon: "M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z" },
  { ad: "Bir aylık", ac: "30 gündür buradasın", kosul: () => uyelikGunu() >= 30, ikon: "M4 6h16v14H4zM4 10h16M9 3v4M15 3v4" },
];
// Denetim günlüğü (GUVENLIK.md G1): her sunucu komutu ve hesap değişikliği; zincir kopuksa uyarı gösterilir
const DENETIM_IKON = {
  "Oturum açıldı": "M10 8l4 4-4 4M14 12H4M14 4h5v16h-5", "Hesap oluşturuldu": "M12 12a4 4 0 100-8 4 4 0 000 8zM4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5",
  "Şifre değişti": "M7 11V8a5 5 0 0110 0v3M6 11h12v9H6z", "Şifre sıfırlandı": "M7 11V8a5 5 0 0110 0v3M6 11h12v9H6z",
  "E-posta değişti": "M3 6h18v12H3zM3 7l9 7 9-7", "Diğer cihazlardan çıkış yapıldı": "M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10",
  "Sunucu silindi": "M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12",
};
const DENETIM_SUNUCU = "M4 4.5h16v6H4zM4 13.5h16v6H4zM7.5 7.5h.01M7.5 16.5h.01";
let denetimOnbellek = { t: 0, v: null };
async function denetimCiz(h) {
  const kutu = $("#hsEtkinlik");
  const satir = (ad, ikinci, ik) =>
    `<div class="hs-satir sabit hs-olay"><span class="hs-olay-ikon"><svg viewBox="0 0 24 24"><path d="${ik}"/></svg></span><span class="hs-deger"><b>${esc(ad)}</b><small>${ikinci}</small></span></div>`;
  let d = denetimOnbellek.v;
  if (!d || Date.now() - denetimOnbellek.t > 30000) {
    try { d = await al("/api/hesap/denetim"); denetimOnbellek = { t: Date.now(), v: d }; } catch (e) { d = null; }
  }
  if (d && d.kayitlar && d.kayitlar.length) {
    kutu.innerHTML = (d.zincir_saglam ? "" : '<div class="hs-satir sabit"><span class="hs-deger uyari-metin">Günlük zincirinde kopukluk var: kayıtlar değiştirilmiş olabilir. Yöneticiye bildir.</span></div>') +
      d.kayitlar.slice(0, 15).map((e) => satir(e.islem + (e.hedef ? " · " + e.hedef : ""), `${tarihSaat(e.zaman)} · ${esc(e.cihaz || "")}`,
        DENETIM_IKON[e.islem] || (e.islem.startsWith("Sunucu") || e.islem.startsWith("Bekçi") ? DENETIM_SUNUCU : DENETIM_IKON["Oturum açıldı"]))).join("") +
      `<div class="hs-satir sabit"><span class="hs-deger soluk">${d.zincir_saglam ? "✓ Kayıt zinciri sağlam" : "Kayıt zinciri kopuk"} · son ${Math.min(15, d.kayitlar.length)} / ${d.toplam} kayıt</span></div>`;
    return;
  }
  const olaylar = [
    h.sifre_degisim && ["Şifre değiştirildi", h.sifre_degisim, DENETIM_IKON["Şifre değişti"]],
    h.onceki_giris && ["Oturum açıldı", h.onceki_giris, DENETIM_IKON["Oturum açıldı"]],
    h.olusturma && ["Hesap oluşturuldu", h.olusturma, DENETIM_IKON["Hesap oluşturuldu"]],
  ].filter(Boolean).sort((a, b) => String(b[1]).localeCompare(String(a[1])));
  kutu.innerHTML = olaylar.map(([ad, t, ik]) => satir(ad, tarihSaat(t), ik)).join("")
    || '<div class="hs-satir sabit"><span class="hs-deger soluk">Henüz bir etkinlik yok.</span></div>';
}
function hesabimEkCiz() {
  if (!hesap) return;
  const h = hesap, p = h.plan || {}, cal = ornekler.filter((o) => o.durum === "çalışıyor");
  $("#hkMakine").textContent = ornekler.length;
  $("#hkCalisan").textContent = cal.length;
  $("#hkSure").textContent = sureUzun(cal.reduce((t, o) => t + (o.süre_sn || 0), 0));
  $("#hkMakineAlt").textContent = h.yonetici || !p.m ? "Sunucu sınırın yok." : `Planında en çok ${p.m} sunucu, aynı anda ${p.c || 1} çalışan.`;
  $("#hkGun").textContent = `${uyelikGunu()}. gününde`;
  $("#hkGunAlt").textContent = h.olusturma ? tarih(h.olusturma) + " tarihinden beri MegscriptVM'desin" : "";
  $("#gvGiris").textContent = GIRIS_AD[h.giris_turu] || "Google";
  $("#gvEposta").innerHTML = h.eposta_dogru ? '<span class="iyi-metin">Doğrulandı</span>' : '<span class="uyari-metin">Doğrulanmadı</span>';
  $("#gvOnceki").textContent = h.onceki_giris ? tarihSaat(h.onceki_giris) : "Bu ilk oturumun";
  $("#gvSifre").textContent = !h.sifre_var ? "Google ile giriş yapıyorsun" : h.sifre_degisim ? "Son değişiklik: " + tarih(h.sifre_degisim) : "Kayıtta belirlendi";
  $("#hsSifreSatir").classList.toggle("sabit", !h.sifre_var);
  // güvenlik kontrolü: öneriler
  const oneriler = [];
  if (h.eposta_dogru === false) oneriler.push(["E-posta adresini doğrula", "#hesabim/kisisel/eposta"]);
  if (h.sifre_var && (!h.sifre_degisim ? Date.now() - new Date(h.olusturma || Date.now()) > 180 * 864e5 : Date.now() - new Date(h.sifre_degisim) > 180 * 864e5))
    oneriler.push(["Şifren 6 aydan eski: yenilemeyi düşün", "#hesabim/guvenlik/sifre"]);
  const iyi = !oneriler.length;
  const kalkanTik = '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v6c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6zM9 12l2.2 2.2L15.5 10"/></svg>';
  const kalkanUyari = '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v6c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6zM12 8.5v4M12 15.5h.01"/></svg>';
  for (const [ik, bas, met] of [["#hsGuvenIkon", "#hsGuvenBaslik", "#hsGuvenMetin"], ["#hsDurumIkon", "#hsDurumBaslik", "#hsDurumMetin"]]) {
    $(ik).innerHTML = iyi ? kalkanTik : kalkanUyari;
    $(ik).classList.toggle("iyi", iyi);
    $(ik).classList.toggle("uyari", !iyi);
    $(bas).textContent = iyi ? "Hesabın korunuyor" : `${oneriler.length} güvenlik önerin var`;
    $(met).textContent = iyi ? "Güvenlik kontrolünde sorun bulunmadı." : "Hesabını daha güvenli yapmak için önerilere göz at.";
  }
  $("#hsGuvenBag").textContent = iyi ? "Güvenliği gör" : "Önerileri gör";
  $("#hsNavUyari").hidden = iyi;
  $("#hsOneriler").innerHTML = oneriler.map(([m, h2]) => `<li><a href="${h2}">${esc(m)}</a></li>`).join("");
  // son güvenlik etkinliği: sunucudaki denetim günlüğü (hash zinciri); yoksa hesap tarihlerinden
  denetimCiz(h);
  const c = typeof cihazBilgisi === "function" ? cihazBilgisi() : null;
  if (c) $("#hsCihazAd").textContent = `${c.isletim} · ${c.tarayici}`;
  const kazanilan = ROZETLER.filter((r) => r.kosul(h));
  $("#rozetSayi").textContent = `${kazanilan.length} / ${ROZETLER.length}`;
  $("#rozetIzgara").innerHTML = ROZETLER.map((r) => {
    const v = r.kosul(h);
    return `<div class="basari ${v ? "kazanildi" : ""}" title="${esc(r.ac)}"><span><svg viewBox="0 0 24 24"><path d="${r.ikon}"/></svg></span><b>${esc(r.ad)}</b><small>${esc(r.ac)}</small></div>`;
  }).join("");
  temaSecCiz();
}
$("#oturumlarDugme").addEventListener("click", async (e) => {
  const d = e.currentTarget;
  if (!(await onayla("Diğer cihazlardan çıkış yapılsın mı?", "Bu cihaz dışındaki bütün oturumların kapanır. Bu cihazda açık kalırsın."))) return;
  dugmeMesgul(d, "Kapatılıyor…");
  try {
    hesap = await gonder("/api/hesap/oturumlar");
    hesapCiz();
    hesabimCiz();
    bildir("Diğer bütün cihazlardaki oturumların kapatıldı");
  } catch (er) { bildir(er.message, false); } finally { dugmeMesgul(d, ""); }
});
$("#veriIndir").addEventListener("click", () => {
  const h = hesap || {};
  const veri = {
    indirme: new Date().toISOString(),
    hesap: { ad: h.ad, eposta: h.eposta, kullanici_adi: h.kadi, giris_turu: h.giris_turu, uyelik: h.olusturma, plan: h.plan && h.plan.ad, profil: h.profil },
    sunucular: ornekler.map((o) => ({ ad: o.ad, not: o.not, port: o.port, kademe: o.kademe, bekci: o.otomatik, durum: o.durum, olusturma: o.oluşturma })),
  };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(veri, null, 2)], { type: "application/json" }));
  a.download = `mscriptvm-${h.kadi || "hesabim"}.json`;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  bildir("Verilerin indirildi");
});

// ---------------------------------------------------------------- geri bildirim ve kısayollar
function modalAc(id) { hesapMenuKapat(); $(id).hidden = false; }
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-ac-geri]")) {
    if (!BULUT || !hesap) return bildir("Geri bildirim için bulut hesabınla giriş yap.", false);
    $("#geriForm").reset();
    $("#geriHata").hidden = true;
    $$("#geriTur button").forEach((b, i) => b.classList.toggle("secili", i === 0));
    modalAc("#geriModal");
    setTimeout(() => $("#geriForm").metin.focus(), 60);
  }
  if (e.target.closest("[data-ac-kisayol]")) modalAc("#kisayolModal");
  const m = e.target.closest(".modal");
  if (m && m.id !== "onayModal" && (e.target === m || e.target.closest("[data-modal-kapat]"))) m.hidden = true;
  const t = e.target.closest("#geriTur button");
  if (t) $$("#geriTur button").forEach((b) => b.classList.toggle("secili", b === t));
});
$("#geriForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.currentTarget, d = $("#geriDugme"), hm = $("#geriHata");
  hm.hidden = true;
  if (f.metin.value.trim().length < 10) { hm.textContent = "Biraz daha ayrıntı yaz (en az 10 karakter)."; hm.hidden = false; return; }
  dugmeMesgul(d, "Gönderiliyor…");
  try {
    await gonder("/api/geri-bildirim", { tur: ($("#geriTur .secili") || {}).dataset?.v || "oneri", metin: f.metin.value.trim(), sayfa: location.hash || "#genel" });
    $("#geriModal").hidden = true;
    bildir("Teşekkürler! Mesajın ekibe ulaştı");
  } catch (er) { hm.textContent = er.message; hm.hidden = false; } finally { dugmeMesgul(d, ""); }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { hesapMenuKapat(); $$(".modal").forEach((m) => { if (m.id !== "onayModal") m.hidden = true; }); return; }
  if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest("input, textarea, select, [contenteditable]")) return;
  if (e.key === "?") { e.preventDefault(); modalAc("#kisayolModal"); }
  else if (e.key === "n" || e.key === "N") { if (!girisAcik) { e.preventDefault(); cekmeceAc(); } }
});

// ---------------------------------------------------------------- blog (veri: blog.js)
const BLOG_VERI = typeof BLOG !== "undefined" ? BLOG : [];
const blogSatir = (t) => esc(t).replace(/`([^`]+)`/g, "<code>$1</code>");
function blogCiz(slug) {
  const y = BLOG_VERI.find((b) => b.slug === decodeURIComponent(slug || ""));
  $("#blogListeKap").hidden = !!y;
  $("#blogYazi").hidden = !y;
  if (!y) {
    $("#blogIzgara").innerHTML = BLOG_VERI.map((b, i) => `
      <a class="kart blog-kart${i === 0 ? " one" : ""}" href="#blog/${encodeURIComponent(b.slug)}">
        <span class="blog-etiket">${esc(b.etiket)}</span>
        <h4>${esc(b.baslik)}</h4>
        <p>${blogSatir(b.ozet)}</p>
        <small>${guncelTarih(b.tarih)} · ${b.okuma} dk okuma</small>
      </a>`).join("") || '<p class="soluk">Henüz yazı yok.</p>';
    return;
  }
  $("#sayfaBaslik").textContent = y.baslik;
  document.title = `${y.baslik} · MegscriptVM Blog`;
  const govde = y.govde.map(([tur, v]) => {
    if (tur === "h") return `<h3>${blogSatir(v)}</h3>`;
    if (tur === "kod") return `<pre class="blog-kod"><code>${esc(v)}</code></pre>`;
    if (tur === "liste") return `<ul>${v.map((m) => `<li>${blogSatir(m)}</li>`).join("")}</ul>`;
    if (tur === "ipucu") return `<p class="blog-ipucu">${blogSatir(v)}</p>`;
    return `<p>${blogSatir(v)}</p>`;
  }).join("");
  const i = BLOG_VERI.indexOf(y), sonraki = BLOG_VERI[i + 1];
  $("#blogYazi").innerHTML = `
    <a class="blog-geri" href="#blog"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>Bütün yazılar</a>
    <span class="blog-etiket">${esc(y.etiket)}</span>
    <h2>${esc(y.baslik)}</h2>
    <small class="blog-bilgi">${guncelTarih(y.tarih)} · ${y.okuma} dk okuma · MegscriptVM ekibi</small>
    <div class="blog-govde">${govde}</div>
    ${sonraki ? `<a class="blog-sonraki" href="#blog/${encodeURIComponent(sonraki.slug)}"><small>Sıradaki yazı</small><b>${esc(sonraki.baslik)}</b></a>` : ""}`;
}

// ---------------------------------------------------------------- tema
function temaUygula(t, kaydet = true) {
  document.documentElement.dataset.tema = t;
  if (kaydet) try { localStorage.setItem("mscriptvm-tema", t); } catch (e) { /* özel pencere */ }
}
$("#temaDugme").addEventListener("click", () => {
  const simdi = document.documentElement.dataset.tema || (matchMedia("(prefers-color-scheme: light)").matches ? "acik" : "koyu");
  temaSec(simdi === "acik" ? "koyu" : "acik");
});
{
  let t = null;
  try { t = localStorage.getItem("mscriptvm-tema"); } catch (e) { /* özel pencere */ }
  if (t === "acik" || t === "koyu") temaUygula(t, false);   // yoksa ya da "sistem"se stil.css sistem tercihini izler
}

window.addEventListener("hashchange", sayfaGoster);
kademeCiz();
hesapCiz();
planKpiCiz();
(async () => {
  if (BULUT) {
    try { await yapilandirmaAl(); } catch (e) { /* giriş ekranı yeniden dener */ }
    let h;
    try { h = await al("/api/ben"); }
    catch (e) { if (!e.giris) girisHatasi(e.message); return girisAcik ? undefined : girisGoster(); }
    if (h.durum !== "aktif") { hesap = h; hesapCiz(); return bekleGoster(); }
    hesap = h;
    hesapCiz();
    planKpiCiz();
  }
  sayfaGoster();
  tazele();
})();
tazeleSayaci = setInterval(tazele, 2000);

// "Yükselt" düğmesi: açık pencereyi kapatır, Planlar açılır (adres #planlar)
$("#yukseltDugme").addEventListener("click", () => cekmeceKapat());
