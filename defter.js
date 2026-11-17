// Kod defteri (Colab / Kaggle gibi): sunucuya tıklayınca açılır. Her hücrenin bir adı vardır; açık hücreler
// sırayla tek program olarak sunucuda 7/24 çalışır (bekçi çökeni yeniden kaldırır). Defter, makinenin kodu
// olarak saklanır: hücreler "--%% hücre: ad" satırlarıyla ayrılır, kapalı hücrenin satırları "--| " ile yorumdur.
// Böylece motorda ayrı bir dosya ya da yeni uç gerekmez (/api/kod okur, /api/guncelle yazar ve yeniden başlatır).
// uygulama.js'ten sonra yüklenir; $, al, gonder, esc, gizle, ornekler, bildir... oradan gelir.

// Metin hücresi (Colab'daki "Text" gibi): "--%% metin: ad" işaretinin altındaki satırlar "--: " ile yorumdur,
// program olarak çalışmaz; defterde Markdown olarak görünür.
const HUCRE_IM = /^--%% (hücre|metin)( kapalı)?:[ \t]?(.*)$/;
const AZAMI_DEFTER = 200000;                     // motorun kod sınırı (bayt)
let defterAd = null;                             // açık defterin makinesi
let hucreler = [];                               // [{ad, acik, kod, tur: "kod" | "metin", duzenle?}]
let defterHarita = [];                           // sunucudaki kodun hücre satırları: [{i, bas, adet}] (hata eşleme)
let defterKirli = false, defterYukleniyor = false, defterSayac = null, defterSonCikti = "";
const taslaklar = new Map();                     // kaydedilmemiş defterler (sayfa değişse de kaybolmaz)

// ---------------------------------------------------------------- biçim: defter <-> kod
function hucreAdi(s, i, tur = "kod") {
  const t = String(s || "").replace(/[\r\n]+/g, " ").trim().slice(0, 40);
  return t || `${tur === "metin" ? "metin" : "hücre"}-${i + 1}`;
}
// İlk hücre her zaman zorunlu "altyapı" hücresidir (âleme_bağla satırları, ayarlar, port...): silinmez, taşınmaz,
// kapatılmaz (içi temizlenebilir). Kod ve metin hücreleri ise serbestçe eklenir ve silinir.
const ALTYAPI_IM = /^--%% altyapı\s*$/;
const yeniAltyapi = (kod = "") => ({ ad: "altyapı", acik: true, kod, sabit: true });
function defterCoz(metin) {
  const satirlar = String(metin || "").replace(/\r\n/g, "\n").split("\n");
  const l = [], once = [];
  let su = null, alt = null;
  for (const s of satirlar) {
    const m = HUCRE_IM.exec(s);
    if (ALTYAPI_IM.test(s) && !alt && !l.length) { alt = su = { ad: "altyapı", acik: true, satir: [], sabit: true }; }
    else if (m) {
      const tur = m[1] === "metin" ? "metin" : "kod";
      su = { ad: hucreAdi(m[3], l.length, tur), acik: tur === "metin" || !m[2], satir: [], tur };
      l.push(su);
    }
    else if (su) su.satir.push(su.tur === "metin" ? s.replace(/^--: ?/, "") : su.acik ? s : s.replace(/^--\| ?/, ""));
    else once.push(s);
  }
  const kod = (x) => x.join("\n").replace(/\s+$/, "");
  let hucre = l.map((h) => ({ ad: h.ad, acik: h.acik, kod: kod(h.satir), tur: h.tur }));
  let altKod = alt ? kod(alt.satir) : "";
  if (!l.length && !alt) {                      // defterden önceki tek parça kod: imza altyapıya, gövde "ana" hücresine
    const tum = kod(once);
    const imza = /^--![^\n]*/.exec(tum);
    altKod = imza ? imza[0] : "";
    hucre = [{ ad: "ana", acik: true, kod: imza ? tum.slice(imza[0].length).replace(/^\n/, "") : tum, tur: "kod" }];
  } else if (once.some((s) => s.trim())) altKod = kod([...once, ...(altKod ? [altKod] : [])]);   // işaretten önceki satırlar (dil imzası vb.)
  if (!hucre.length) hucre.push({ ad: "hücre-1", acik: true, kod: "", tur: "kod" });
  return [yeniAltyapi(altKod), ...hucre];
}
// Kod ve hata eşleme haritası. Dil imzası (--! lang=..) yalnız 1. satırda geçerli: altyapıdaysa en üste taşınır.
function defterBirlestir(l) {
  const out = [], harita = [];
  l.forEach((h, i) => {
    let kod = h.kod.replace(/\r\n/g, "\n").replace(/\s+$/, "");
    if (i === 0 && /^--!/.test(kod)) { const n = kod.indexOf("\n"); out.push(n < 0 ? kod : kod.slice(0, n)); kod = n < 0 ? "" : kod.slice(n + 1); }
    const yazi = h.tur === "metin";
    out.push(i === 0 ? "--%% altyapı" : yazi ? `--%% metin: ${hucreAdi(h.ad, i - 1, "metin")}`
      : `--%% hücre${h.acik ? "" : " kapalı"}: ${hucreAdi(h.ad, i - 1)}`);
    const sat = kod ? kod.split("\n") : [];
    harita.push({ i, bas: out.length + 1, adet: sat.length });
    sat.forEach((s) => out.push(yazi ? (s ? "--: " + s : "--:") : h.acik ? s : "--| " + s));
  });
  const metin = out.join("\n") + "\n";
  const kayma = /^--!/.test(metin) ? 0 : 1;      // imza yoksa motor en üste "--! lang=tr" ekler
  harita.forEach((x) => (x.bas += kayma));
  return { metin, harita };
}
function satirdanHucre(satir) {
  for (const x of defterHarita) if (satir >= x.bas && satir < x.bas + x.adet) return { i: x.i, satir: satir - x.bas + 1 };
  return null;
}

// ---------------------------------------------------------------- çizim
const H_IKON = {
  yukari: '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  asagi: '<svg viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
  sil: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg>',
  arti: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  metin: '<svg viewBox="0 0 24 24"><path d="M5 6h14M5 10h14M5 14h9M5 18h6"/></svg>',
  kalem: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/></svg>',
  tamam: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  temizle: '<svg viewBox="0 0 24 24"><path d="M15 4l5 5-9 9H6l-2-2zM9 10l5 5M13 20h7"/></svg>',
};
const KILIT = '<svg viewBox="0 0 24 24"><path d="M7 11V8a5 5 0 0110 0v3M6 11h12v9H6z"/></svg>';

// ---------------------------------------------------------------- Markdown (metin hücreleri)
// Küçük ve güvenli: önce kaçış, sonra yalnız bilinen biçimler. Bağlantılar yalnız http(s).
function mdSatir(ham) {
  return String(ham).split(/(`[^`]+`)/).map((p) => {
    if (/^`[^`]+`$/.test(p)) return `<code>${esc(p.slice(1, -1))}</code>`;
    return esc(p)
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
      .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, "$1<i>$2</i>")
      .replace(/(^|[^_\w])_([^_\s][^_]*?)_(?!\w)/g, "$1<i>$2</i>");
  }).join("");
}
function mdHtml(src) {
  const sat = String(src || "").replace(/\r\n/g, "\n").split("\n"), out = [];
  const blokBasi = (s) => /^(```|#{1,4}\s|>|\s*[-*+]\s|\s*\d+[.)]\s|\s*(-{3,}|\*{3,})\s*$)/.test(s);
  let i = 0;
  while (i < sat.length) {
    const s = sat[i];
    let m;
    if (!s.trim()) { i++; continue; }
    if (/^```/.test(s)) {
      const dil = s.slice(3).trim(), k = [];
      for (i++; i < sat.length && !/^```/.test(sat[i]); i++) k.push(sat[i]);
      i++;
      out.push(`<pre class="md-kod"${dil ? ` data-dil="${esc(dil)}"` : ""}><code>${esc(k.join("\n"))}</code></pre>`);
    } else if ((m = /^(#{1,4})\s+(.*)$/.exec(s))) {
      out.push(`<h${m[1].length + 2} class="md-b">${mdSatir(m[2])}</h${m[1].length + 2}>`);
      i++;
    } else if (/^\s*(-{3,}|\*{3,})\s*$/.test(s)) {
      out.push("<hr>");
      i++;
    } else if (/^>/.test(s)) {
      const k = [];
      for (; i < sat.length && /^>/.test(sat[i]); i++) k.push(sat[i].replace(/^>\s?/, ""));
      out.push(`<blockquote>${mdHtml(k.join("\n"))}</blockquote>`);
    } else if ((m = /^\s*([-*+]|\d+[.)])\s/.exec(s))) {
      const sirali = /\d/.test(m[1]), desen = sirali ? /^\s*\d+[.)]\s+(.*)$/ : /^\s*[-*+]\s+(.*)$/, k = [];
      for (; i < sat.length && (m = desen.exec(sat[i])); i++) {
        const g = /^\[( |x|X)\]\s+(.*)$/.exec(m[1]);   // - [ ] / - [x] yapılacaklar
        k.push(g ? `<li class="md-is${g[1] === " " ? "" : " bitti"}"><span aria-hidden="true">${g[1] === " " ? "☐" : "☑"}</span> ${mdSatir(g[2])}</li>` : `<li>${mdSatir(m[1])}</li>`);
      }
      out.push(sirali ? `<ol>${k.join("")}</ol>` : `<ul>${k.join("")}</ul>`);
    } else {
      const k = [];
      for (; i < sat.length && sat[i].trim() && !(k.length && blokBasi(sat[i])); i++) k.push(mdSatir(sat[i]));
      out.push(`<p>${k.join("<br>")}</p>`);
    }
  }
  return out.join("");
}

function ekleSatiri(i) {
  return `<div class="hucre-ekle-satir">
    <button type="button" class="hucre-ekle" data-ekle="${i}">${H_IKON.arti}Kod hücresi</button>
    <button type="button" class="hucre-ekle" data-ekle="${i}" data-tur="metin">${H_IKON.arti}Metin hücresi</button>
  </div>`;
}
const tasiDugmeleri = (i) => `
        <button type="button" data-h="yukari" title="Yukarı taşı" aria-label="Yukarı taşı" ${i <= 1 ? "disabled" : ""}>${H_IKON.yukari}</button>
        <button type="button" data-h="asagi" title="Aşağı taşı" aria-label="Aşağı taşı" ${i === hucreler.length - 1 ? "disabled" : ""}>${H_IKON.asagi}</button>
        <button type="button" class="kirmizi" data-h="sil" title="Hücreyi sil" aria-label="Hücreyi sil">${H_IKON.sil}</button>`;
function hucreHtml(h, i) {
  const n = Math.max(1, h.kod.split("\n").length);
  const yazi = h.tur === "metin";
  const govde = `<div class="hucre-govde">
      ${yazi ? "" : `<pre class="editor-sat" aria-hidden="true">${Array.from({ length: n }, (_, k) => k + 1).join("\n")}</pre>`}
      <textarea data-h="kod" spellcheck="${yazi}" autocapitalize="off" autocomplete="off" wrap="${yazi ? "soft" : "off"}" rows="1" placeholder="${i === 0
        ? "Altyapı: âleme_bağla satırları, sabitler, port ve ortak ayinler. Program her açılışta önce bunu çalıştırır."
        : yazi ? "Metin yaz: # başlık, **kalın**, *eğik*, `kod`, - liste, [bağlantı](https://…) (Shift+Enter: bitir)"
        : "Kodunu yaz… (Shift+Enter: kaydet ve çalıştır)"}">${esc(h.kod)}</textarea>
    </div>
    <div class="hucre-hata" hidden></div>`;
  const ekle = ekleSatiri(i + 1);
  if (i === 0) return `<div class="hucre altyapi" data-i="0">
    <div class="hucre-bas">
      <span class="hucre-no kilitli" title="Zorunlu hücre">${KILIT}</span>
      <b class="hucre-ad sabit">altyapı</b>
      <span class="hucre-rozet">zorunlu · hep ilk çalışır</span>
      <small class="hucre-bilgi">${n} satır</small>
      <div class="hucre-eylem">
        <button type="button" class="kirmizi" data-h="temizle" title="Altyapı kodunu temizle" aria-label="Altyapı kodunu temizle" ${h.kod.trim() ? "" : "disabled"}>${H_IKON.temizle}</button>
      </div>
    </div>
    ${govde}
  </div>
  ${ekle}`;
  if (yazi) {
    const duzenle = h.duzenle || !h.kod.trim();
    return `<div class="hucre metin${duzenle ? " duzenle" : ""}" data-i="${i}">
    <div class="hucre-bas">
      <span class="hucre-no metin-im" title="Metin hücresi: programa girmez">${H_IKON.metin}</span>
      <input class="hucre-ad" data-h="ad" value="${esc(h.ad)}" maxlength="40" spellcheck="false" aria-label="Hücre adı" placeholder="hücre adı">
      <div class="hucre-eylem">
        <button type="button" data-h="duzenle" title="${duzenle ? "Bitir (Shift+Enter)" : "Düzenle"}" aria-label="${duzenle ? "Bitir" : "Düzenle"}">${duzenle ? H_IKON.tamam : H_IKON.kalem}</button>
        ${tasiDugmeleri(i)}
      </div>
    </div>
    ${duzenle ? govde : `<div class="metin-goster" data-h="goster" title="Düzenlemek için çift tıkla">${mdHtml(h.kod)}</div>`}
  </div>
  ${ekle}`;
  }
  return `<div class="hucre${h.acik ? "" : " kapali"}" data-i="${i}">
    <div class="hucre-bas">
      <span class="hucre-no">[${i}]</span>
      <input class="hucre-ad" data-h="ad" value="${esc(h.ad)}" maxlength="40" spellcheck="false" aria-label="Hücre adı" placeholder="hücre adı">
      <small class="hucre-bilgi">${h.acik ? `${n} satır` : "kapalı · çalışmaz"}</small>
      <div class="hucre-eylem">
        <label class="anahtar kucuk" title="Kapalı hücre programa girmez"><input type="checkbox" data-h="acik" ${h.acik ? "checked" : ""}><span></span>Çalışsın</label>
        ${tasiDugmeleri(i)}
      </div>
    </div>
    ${govde}
  </div>
  ${ekle}`;
}
function hucrelerCiz(odak) {
  $("#dfHucreler").innerHTML = hucreler.map(hucreHtml).join("");   // altyapının altındaki ekleme satırı hep durur
  $$("#dfHucreler textarea").forEach(boyutla);
  if (odak != null) { const t = $(`#dfHucreler .hucre[data-i="${odak}"] textarea`); if (t) t.focus(); }
  hataCiz();
}
// Yükseklik yalnız içeriğe göre: önce 0'a indirilir, sonra içeriğin gerçek boyu verilir (eski uzun koddan kalan
// boy, satırlar silinince geri küçülür). Yatay kaydırma çubuğu varsa onun boyu da eklenir, son satır örtülmez.
function boyutla(t) {
  t.style.height = "0px";
  const boy = Math.max(t.scrollHeight, 66);
  t.style.height = boy + "px";
  const cubuk = t.offsetHeight - t.clientHeight;
  if (cubuk > 0) t.style.height = boy + cubuk + "px";
  const n = Math.max(1, t.value.split("\n").length), h = t.closest(".hucre");
  const sat = h.querySelector(".editor-sat"), bilgi = h.querySelector(".hucre-bilgi");
  if (sat) sat.textContent = Array.from({ length: n }, (_, k) => k + 1).join("\n");
  if (bilgi && !h.classList.contains("kapali")) bilgi.textContent = `${n} satır`;
}
function kirlet(v = true) {
  defterKirli = v;
  if (defterAd) { if (v) taslaklar.set(defterAd, hucreler); else taslaklar.delete(defterAd); }
  const k = $("#dfKayit");
  k.textContent = v ? "Kaydedilmedi" : "Kaydedildi";
  k.classList.toggle("kirli", v);
}
function defterBasCiz() {
  if (!defterAd) return;
  const o = ornekler.find((x) => x.ad === defterAd), kutu = $("#dfUst");
  kutu.dataset.ad = defterAd;
  $("#dfAd").textContent = defterAd;
  if (!o) { $("#dfAlt").textContent = "sunucu bilgisi yükleniyor…"; return; }
  const ç = o.durum === "çalışıyor";
  $("#dfAlt").textContent = makineAlt(o);
  $("#dfDurum").className = "durum " + o.durum;
  $("#dfDurum").innerHTML = `<i></i>${durumAd[o.durum] || esc(o.durum)}`;
  $("#dfBellek").textContent = ç ? mb(o.bellek_kb) : "—";
  $("#dfSure").textContent = ç ? sure(o.süre_sn) : "—";
  $("#dfPort").textContent = o.port || "—";
  $("#dfKademe").textContent = kademeKisa(o.kademe);
  const oto = $("#dfOto");
  if (document.activeElement !== oto) oto.checked = !!o.otomatik;
  $("#dfCalistirMetin").textContent = ç ? "Kaydet ve yeniden çalıştır" : "Kaydet ve çalıştır";
  $("#dfDurdur").hidden = !ç;
}

// ---------------------------------------------------------------- yükle / kaydet
async function defterAc(ad) {
  if (defterAd === ad && hucreler.length) { defterBasCiz(); ciktiTazele(); return; }
  defterAd = ad;
  hucreler = [];
  defterHarita = [];
  defterSonCikti = "";
  $("#dfHucreler").innerHTML = '<p class="soluk defter-yukleniyor">Defter açılıyor…</p>';
  $("#dfCikti").innerHTML = "";
  defterBasCiz();
  defterYukleniyor = true;
  try {
    const kod = (await al("/api/kod?ad=" + encodeURIComponent(ad))).kod;
    if (defterAd !== ad) return;
    defterHarita = defterBirlestir(defterCoz(kod)).harita;
    const taslak = taslaklar.get(ad);
    hucreler = taslak || defterCoz(kod);
    hucrelerCiz();
    kirlet(!!taslak);
  } catch (er) {
    $("#dfHucreler").innerHTML = `<div class="bos-durum"><b>Defter açılamadı</b><p>${esc(er.message)}</p><a class="dugme" href="#makineler">Sunuculara dön</a></div>`;
  } finally { defterYukleniyor = false; }
  ciktiTazele();
}
async function defterYenile() {                  // çekmeceden kaydedildiyse sunucudaki kodu yeniden oku
  if (!defterAd) return;
  const ad = defterAd;
  taslaklar.delete(ad);
  defterAd = null;
  await defterAc(ad);
}
async function defterKaydet(calistir) {
  if (!defterAd || defterYukleniyor) return;
  const o = ornekler.find((x) => x.ad === defterAd);
  if (!o) return bildir("Sunucu bilgisi henüz gelmedi; birazdan yeniden dene.", false);
  hucreler.forEach((h, i) => (h.ad = i === 0 ? "altyapı" : hucreAdi(h.ad, i - 1, h.tur)));
  const { metin, harita } = defterBirlestir(hucreler);
  if (!hucreler.some((h) => h.tur !== "metin" && h.acik && h.kod.trim())) return bildir("Çalışacak kod yok: en az bir kod hücresi açık ve dolu olmalı.", false);
  if (new Blob([metin]).size > AZAMI_DEFTER) return bildir("Defter çok büyük (en çok 200 KB).", false);
  const d = $("#dfKaydet");
  if (d.disabled) return;
  d.disabled = true;
  try {
    await gonder(`/api/guncelle?ad=${encodeURIComponent(defterAd)}`, {
      kod: metin, kademe: o.kademe || 0, işlemci: o.işlemci || 0, politika: o.politika || "katı",
      port: o.port || 0, not: o.not || "", otomatik: o.otomatik ? 1 : 0,
    });
    defterHarita = harita;
    kirlet(false);
    $$("#dfHucreler .hucre-ad").forEach((g, i) => (g.value = hucreler[i].ad));
    if (calistir && o.durum !== "çalışıyor") await gonder(`/api/baslat?ad=${encodeURIComponent(defterAd)}`);
    bildir(calistir ? (o.durum === "çalışıyor" ? `${defterAd} yeni kodla yeniden başladı` : `${defterAd} çalışıyor`) : `${defterAd} kaydedildi`);
    defterSonCikti = "";
    await tazele();
    setTimeout(ciktiTazele, 700);
  } catch (er) {
    bildir(er.message, false);
    if (er.plan && BULUT) setTimeout(() => (location.hash = "#planlar"), 1600);
  } finally { d.disabled = false; }
}

// ---------------------------------------------------------------- çıktı (bu çalıştırmanın günlüğü)
let sonHatalar = [];                             // [{i, satir, mesaj}]
// Derleme hatası: "betik.mgs:4:1: hata: ..."; çalışma hatası: "Yakalanmayan lanet: ..." ve altında yığın
// satırları "<betik> (satır 8)" (ilk satır hatanın olduğu yer). Uyarılar hücreyi kırmızıya boyamaz.
function hataBul(satirlar) {
  const l = [];
  let lanet = null;                              // son "lanet" satırı; ilk yığın satırını bekler
  const ekle = (satir, mesaj, k) => {
    const h = satirdanHucre(satir);
    if (h && !l.some((x) => x.i === h.i)) l.push({ ...h, mesaj, k });
  };
  satirlar.forEach((s, k) => {
    let m = /\.mgs:(\d+):\d+:\s*(?:hata|error):\s*(.*)$/i.exec(s);
    if (m) return ekle(+m[1], m[2], k);
    if (/^(Yakalanmayan lanet|Uncaught curse)/i.test(s)) { lanet = s.replace(/^[^:]*:\s*/, ""); return; }
    m = /\((?:satır|line) (\d+)\)\s*$/i.exec(s);
    if (m && lanet != null) { ekle(+m[1], lanet, k); lanet = null; }
  });
  return l;
}
function hataCiz() {
  $$("#dfHucreler .hucre").forEach((el) => {
    const i = +el.dataset.i, h = sonHatalar.find((x) => x.i === i), kutu = el.querySelector(".hucre-hata");
    el.classList.toggle("hatali", !!h && !defterKirli);
    if (!kutu) return;                           // metin hücresi görünümde: hata kutusu yok
    kutu.hidden = !h || defterKirli;
    if (h) kutu.innerHTML = `<b>Satır ${h.satir}</b> ${esc(gizle(h.mesaj || "Bu satırda hata oluştu."))}`;
  });
}
async function ciktiTazele() {
  if (!defterAd || document.hidden) return;
  const ad = defterAd;
  let j;
  try { j = await al("/api/gunluk?ad=" + encodeURIComponent(ad) + "&n=400"); } catch (e) { return; }
  if (ad !== defterAd) return;
  let bas = 0;
  j.satırlar.forEach((s, k) => { if (/MegscriptVM: başlatılıyor/.test(s)) bas = k; });
  const satirlar = j.satırlar.slice(bas);
  const anahtar = satirlar.length + "|" + (satirlar[satirlar.length - 1] || "");
  if (anahtar === defterSonCikti) return;
  defterSonCikti = anahtar;
  sonHatalar = hataBul(satirlar);
  const pre = $("#dfCikti"), altta = pre.scrollHeight - pre.scrollTop - pre.clientHeight < 40;
  pre.innerHTML = satirlar.length ? satirlar.map((s, k) => {
    const sinif = s.startsWith("=== ") ? "vm" : /lanet|hata|error|curse/i.test(s) ? "hata" : /uyarı|warning/i.test(s) ? "uyari" : "";
    const h = sonHatalar.find((x) => x.k === k);
    const bag = h ? ` <button type="button" class="hucre-bag" data-git="${h.i}">${esc(hucreler[h.i] ? hucreler[h.i].ad : "hücre " + (h.i + 1))} · satır ${h.satir}</button>` : "";
    return `<span class="l ${sinif}">${esc(gizle(s)) || " "}${bag}</span>`;
  }).join("") : '<span class="bos-satir">Henüz çıktı yok. “Kaydet ve çalıştır” ile başlat; programın yazdıkları burada akar.</span>';
  if (altta) pre.scrollTop = pre.scrollHeight;
  $("#dfCiktiSayac").textContent = satirlar.length ? `${satirlar.length} satır` : "";
  hataCiz();
}

// ---------------------------------------------------------------- olaylar
function defterKapat() {
  defterAd = null;
  clearInterval(defterSayac);
  defterSayac = null;
}
function defterSayfasi(ad) {
  defterAc(ad).then(() => requestAnimationFrame(() => $$("#dfHucreler textarea").forEach(boyutla)));   // gizliyken ölçülemez
  clearInterval(defterSayac);
  defterSayac = setInterval(() => { defterBasCiz(); ciktiTazele(); }, 2500);
}
$("#dfHucreler").addEventListener("input", (e) => {
  const el = e.target.closest(".hucre");
  if (!el) return;
  const h = hucreler[+el.dataset.i];
  if (e.target.dataset.h === "kod") {
    h.kod = e.target.value;
    boyutla(e.target);
    const tm = el.querySelector("[data-h=temizle]");
    if (tm) tm.disabled = !h.kod.trim();
  }
  if (e.target.dataset.h === "ad") h.ad = e.target.value;
  kirlet();
  hataCiz();
});
$("#dfHucreler").addEventListener("change", (e) => {
  if (e.target.dataset.h !== "acik") return;
  const el = e.target.closest(".hucre");
  const h = hucreler[+el.dataset.i];
  h.acik = e.target.checked;
  el.classList.toggle("kapali", !h.acik);
  el.querySelector(".hucre-bilgi").textContent = h.acik ? `${Math.max(1, h.kod.split("\n").length)} satır` : "kapalı · çalışmaz";
  kirlet();
});
$("#dfHucreler").addEventListener("focusout", (e) => {
  if (e.target.dataset.h !== "ad") return;
  const i = +e.target.closest(".hucre").dataset.i;
  if (i === 0) return;
  hucreler[i].ad = hucreAdi(e.target.value, i - 1, hucreler[i].tur);
  e.target.value = hucreler[i].ad;
});
function metinBitir(i) {
  const h = hucreler[i];
  if (!h || h.tur !== "metin") return;
  h.duzenle = false;
  hucrelerCiz();
}
$("#dfHucreler").addEventListener("dblclick", (e) => {
  const g = e.target.closest("[data-h=goster]");
  if (!g || e.target.closest("a")) return;
  const i = +g.closest(".hucre").dataset.i;
  hucreler[i].duzenle = true;
  hucrelerCiz(i);
});
$("#dfHucreler").addEventListener("click", async (e) => {
  const ek = e.target.closest("[data-ekle]");
  if (ek) {
    const i = Math.max(1, +ek.dataset.ekle);    // altyapının üstüne hücre eklenmez
    const tur = ek.dataset.tur === "metin" ? "metin" : "kod", kok = tur === "metin" ? "metin" : "hücre";
    const adlar = new Set(hucreler.map((h) => h.ad));
    let n = hucreler.filter((h) => h.tur === tur).length + 1;
    while (adlar.has(`${kok}-${n}`)) n++;
    hucreler.splice(i, 0, { ad: `${kok}-${n}`, acik: true, kod: "", tur, duzenle: tur === "metin" });
    kirlet();
    return hucrelerCiz(i);
  }
  const b = e.target.closest("button[data-h]");
  if (!b) return;
  const i = +b.closest(".hucre").dataset.i, ne = b.dataset.h;
  if (i === 0) {                                 // altyapı silinmez, taşınmaz; yalnız içi temizlenir
    if (ne !== "temizle" || !hucreler[0].kod.trim()) return;
    if (!(await onayla("Altyapı kodu temizlensin mi?", "Hücre kalır, içindeki bütün satırlar silinir. Kaydedince programdan da çıkar."))) return;
    hucreler[0].kod = "";
    kirlet();
    return hucrelerCiz(0);
  }
  const h = hucreler[i];
  if (ne === "yukari" && i > 1) [hucreler[i - 1], hucreler[i]] = [hucreler[i], hucreler[i - 1]];
  else if (ne === "asagi" && i < hucreler.length - 1) [hucreler[i + 1], hucreler[i]] = [hucreler[i], hucreler[i + 1]];
  else if (ne === "duzenle") {
    if (h.duzenle || !h.kod.trim()) { if (!h.kod.trim()) return bildir("Boş metin hücresi: bir şey yaz ya da hücreyi sil.", false); return metinBitir(i); }
    h.duzenle = true;
    return hucrelerCiz(i);
  } else if (ne === "sil") {
    // Hücre tümüyle kaldırılır (kodu ve kendisi). Kod hücresi kalmazsa altyapının altındaki düğmeyle yenisi eklenir.
    const tur = h.tur === "metin" ? "metin" : "kod";
    if (h.kod.trim() && !(await onayla(`'${h.ad}' ${tur} hücresi silinsin mi?`, "Hücre ve içindeki her şey kaldırılır. Kaydedince programdan da çıkar."))) return;
    hucreler.splice(i, 1);
  } else return;
  kirlet();
  hucrelerCiz(ne === "sil" ? null : ne === "yukari" ? i - 1 : i + 1);
});
$("#dfHucreler").addEventListener("keydown", (e) => {
  const t = e.target;
  if (t.dataset.h === "ad" && e.key === "Enter") { e.preventDefault(); const ta = t.closest(".hucre").querySelector("textarea"); if (ta) ta.focus(); else t.blur(); return; }
  if (t.dataset.h !== "kod") return;
  const a = t.selectionStart, b = t.selectionEnd;
  const hi = +t.closest(".hucre").dataset.i;
  if (hucreler[hi] && hucreler[hi].tur === "metin") {   // metin hücresi: Shift+Enter ya da Esc görünüme döner
    if ((e.key === "Enter" && e.shiftKey) || e.key === "Escape") { e.preventDefault(); if (t.value.trim()) metinBitir(hi); }
    return;
  }
  if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); return defterKaydet(true); }
  if (e.key === "Tab" && !e.shiftKey) {
    e.preventDefault();
    t.setRangeText("    ", a, b, "end");
  } else if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
    const satirBasi = t.value.lastIndexOf("\n", a - 1) + 1;
    let girinti = (t.value.slice(satirBasi, a).match(/^ */) || [""])[0];
    if (/~>\s*$/.test(t.value.slice(satirBasi, a))) girinti += "    ";   // blok açıldı
    e.preventDefault();
    t.setRangeText("\n" + girinti, a, b, "end");
  } else return;
  t.dispatchEvent(new Event("input", { bubbles: true }));
});
document.addEventListener("keydown", (e) => {
  if (!defterAd || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "s") return;
  e.preventDefault();
  defterKaydet(true);
});
$("#dfKaydet").addEventListener("click", () => defterKaydet(true));
$("#dfYalnizKaydet").addEventListener("click", () => defterKaydet(false));
$("#dfAyarlar").addEventListener("click", async () => {
  if (defterKirli && !(await onayla("Kaydedilmemiş değişiklikler var", "Ayarlar penceresi sunucudaki kodu gösterir. Önce defteri kaydetmek ister misin? “Evet” kaydeder ve ayarları açar."))) return;
  if (defterKirli) await defterKaydet(false);
  duzenlemeAc(defterAd);
});
$("#dfCikti").addEventListener("click", (e) => {
  const g = e.target.closest("[data-git]");
  if (!g) return;
  const el = $(`#dfHucreler .hucre[data-i="${g.dataset.git}"]`);
  if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.querySelector("textarea").focus(); }
});
document.addEventListener("visibilitychange", () => { if (!document.hidden && defterAd) ciktiTazele(); });
window.addEventListener("beforeunload", (e) => { if (defterKirli) { e.preventDefault(); e.returnValue = ""; } });

// sunucu kartına (ya da genel bakıştaki satırına) tıklayınca defter açılır; düğmeler ve anahtar kendi işini yapar
document.addEventListener("click", (e) => {
  const kart = e.target.closest(".makine[data-ad], .mini-oge[data-ad]");
  if (!kart || e.target.closest("button, a, label, input")) return;
  location.hash = "#defter/" + encodeURIComponent(kart.dataset.ad);
});
if (location.hash.startsWith("#defter/")) sayfaGoster();
