// megscript sözdizimi araçları (JavaScript): tokenlama, renklendirme, dil bulma ve TR <-> EN çeviri.
// Kurallar derleyicinin lexer'ıyla (src/lexer.cpp) aynıdır; anahtar kelimeler onun tablosundan üretilir
// (anahtar_kelimeler.js). Çeviri `megc --biçimle --dil=tr|en`'in anahtar kelime kısmıyla birebir aynı sonucu verir
// (sınamalar her örnek dosyada karşılaştırır). Bağımlılık yok; tarayıcıda ve Node'da çalışır.
import { ANAHTAR_KELIMELER, OZNITELIKLER } from "./anahtar_kelimeler.js";

// ---------------------------------------------------------------- katlama (lexer.cpp foldTR / foldEN)
const foldEN = (s) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());
const foldTR = (s) => s.replace(/I/g, "ı").replace(/İ/g, "i").toLocaleLowerCase("tr-TR");

function haritala(liste) {
  const en = new Map(), tr = new Map();
  for (const g of liste) {
    if (g.dil !== "tr" && !en.has(foldEN(g.yazim))) en.set(foldEN(g.yazim), g);
    if (g.dil !== "en" && !tr.has(foldTR(g.yazim))) tr.set(foldTR(g.yazim), g);
  }
  return { en, tr };
}
const KELIME = haritala(ANAHTAR_KELIMELER);
const OZN = haritala(OZNITELIKLER);

/** Bir türün o dildeki standart yazımı (tablodaki ilk yazım). Yoksa null. */
export function standartYazim(tur, dil, oznitelik = false) {
  for (const g of oznitelik ? OZNITELIKLER : ANAHTAR_KELIMELER)
    if (g.tur === tur && (g.dil === dil || g.dil === "ortak")) return g.yazim;
  return null;
}

// ---------------------------------------------------------------- tokenlama
const adBasi = (c) => /[A-Za-z_]/.test(c) || c.charCodeAt(0) >= 0x80;
const adParcasi = (c) => adBasi(c) || /[0-9]/.test(c);
const ISLECLER = [":=:", ">>>", ">>?", "~>", "==", "!=", "<=", ">=", "+=", "-=", "*=", "/=", "**", "//", "??", "?.",
  "<", ">", "=", "+", "-", "*", "/", "%", "|", "(", ")", "[", "]", ",", ".", ":", "?"];

/**
 * Kaynağı tokenlara ayırır. Tokenlar kaynağın tamamını kapsar (boşluklar dahil): metinleri birleştirmek kaynağı verir.
 * Token: { tur, metin, bas, son } ve gerekirse { anahtar, dil } (anahtar kelime/öznitelik), { parcalar } (metin).
 * tur: bosluk | satir | yorum | imza | anahtar | oznitelik | ad | sayi | metin | run | islec | hata
 * Metin tokenının parcalar'ı: { tur: "duz" | "ifade" | "kacis" | "ad", metin, bas, son, tokenlar? } (ifade: ^( … ) içi).
 */
export function tokenla(kaynak, secenek = {}) {
  const s = kaynak;
  const t = [];
  let i = 0;
  let dil = secenek.dil || null;            // "tr" | "en" | null: ilk dilsiz olmayan anahtar kelime kilitler
  if (!secenek.parca) {
    if (s.startsWith("﻿")) { t.push({ tur: "bosluk", metin: "﻿", bas: 0, son: 1 }); i = 1; }
    if (s.startsWith("--!", i)) {
      const eol = s.indexOf("\n", i);
      const son = eol < 0 ? s.length : eol;
      const satir = s.slice(i, son);
      const m = /lang=(\w\w)/.exec(satir);
      if (m && (m[1] === "tr" || m[1] === "en")) dil = m[1];
      t.push({ tur: "imza", metin: satir, bas: i, son });
      i = son;
    }
  }
  const ekle = (tur, bas, son, ek) => t.push({ tur, metin: s.slice(bas, son), bas, son, ...ek });

  while (i < s.length) {
    const c = s[i];
    const bas = i;
    if (c === "\n") { ekle("satir", i, i + 1); i++; continue; }
    if (c === " " || c === "\t" || c === "\r") {
      while (i < s.length && (s[i] === " " || s[i] === "\t" || s[i] === "\r")) i++;
      ekle("bosluk", bas, i);
      continue;
    }
    if (s.startsWith("--", i)) {
      if (s[i + 2] === "[") {
        const kap = s.indexOf("]--", i + 3);
        i = kap < 0 ? s.length : kap + 3;
        ekle(kap < 0 ? "hata" : "yorum", bas, i);
      } else {
        while (i < s.length && s[i] !== "\n") i++;
        ekle("yorum", bas, i);
      }
      continue;
    }
    if (c === "~" && s[i + 1] !== ">") { i = metinOku(s, i, t, dil); continue; }
    if (c === "'") {
      let j = i + 1;
      if (s[j] === "\\") j += 2; else j += [...s.slice(j, j + 2)][0]?.length || 1;
      if (s[j] === "'") { i = j + 1; ekle("run", bas, i); continue; }
    }
    if (/[0-9]/.test(c)) {
      if (c === "0" && /[xXbB]/.test(s[i + 1] || "")) {
        i += 2;
        while (i < s.length && /[0-9A-Fa-f_]/.test(s[i])) i++;
      } else {
        while (i < s.length && /[0-9_]/.test(s[i])) i++;
        if (s[i] === "." && /[0-9]/.test(s[i + 1] || "")) { i++; while (i < s.length && /[0-9_]/.test(s[i])) i++; }
        if (/[eE]/.test(s[i] || "") && /[0-9+-]/.test(s[i + 1] || "")) {
          i += 2;
          while (i < s.length && /[0-9]/.test(s[i])) i++;
        }
      }
      ekle("sayi", bas, i);
      continue;
    }
    if (c === "@") {
      let j = i + 1;
      while (j < s.length && adParcasi(s[j])) j++;
      const kelime = s.slice(i + 1, j);
      const g = bul(OZN, kelime, dil);
      i = j;
      if (g) ekle("oznitelik", bas, i, { anahtar: g.tur, dil: g.dil });
      else ekle(kelime && bul(KELIME, kelime, null) ? "ad" : "hata", bas, i);   // @her: ham ad (E8)
      continue;
    }
    if (adBasi(c)) {
      while (i < s.length && adParcasi(s[i])) i++;
      const kelime = s.slice(bas, i);
      if (kelime === "_") { ekle("ad", bas, i); continue; }
      const g = bul(KELIME, kelime, dil);
      if (g === KARISIK) { ekle("hata", bas, i, { neden: "dil karışımı" }); continue; }
      if (g) {
        if (!dil && g.dil !== "ortak") dil = g.dil;
        ekle("anahtar", bas, i, { anahtar: g.tur, dil: g.dil });
      } else {
        ekle("ad", bas, i);
      }
      continue;
    }
    const op = ISLECLER.find((o) => s.startsWith(o, i));
    if (op) { i += op.length; ekle("islec", bas, i); continue; }
    i += c.length;
    ekle("hata", bas, i);
  }
  t.dil = dil;
  return t;
}

const KARISIK = Symbol("karışık");
function bul(harita, kelime, dil) {
  const e = harita.en.get(foldEN(kelime)), r = harita.tr.get(foldTR(kelime));
  if (dil === "en") return e || (r ? KARISIK : null);
  if (dil === "tr") return r || (e ? KARISIK : null);
  if (e && r && e.dil === "ortak") return e;
  return e || r || null;
}

// ~ … ~ metni: kaçışlar, ^ad ve ^( … ) (ifade içi ayrıca tokenlanır, konumlar kaynağa göre)
function metinOku(s, bas, t, dil) {
  const parcalar = [];
  let i = bas + 1, duz = i;
  const duzBitir = (son) => { if (son > duz) parcalar.push({ tur: "duz", metin: s.slice(duz, son), bas: duz, son }); };
  let kapandi = false;
  while (i < s.length) {
    const c = s[i];
    if (c === "~") { duzBitir(i); i++; kapandi = true; break; }
    if (c === "\\") { duzBitir(i); parcalar.push({ tur: "kacis", metin: s.slice(i, i + 2), bas: i, son: i + 2 }); i += 2; duz = i; continue; }
    if (c === "^" && s[i + 1] === "(") {
      let d = 0, k = i + 1, tamam = false;
      for (; k < s.length; k++) {
        if (s[k] === "(") d++;
        else if (s[k] === ")") { if (--d === 0) { tamam = true; break; } }
        else if (s[k] === "~") { k++; while (k < s.length && s[k] !== "~") { if (s[k] === "\\") k++; k++; } }
      }
      if (!tamam) break;
      duzBitir(i);
      const ic = s.slice(i + 2, k);
      const alt = tokenla(ic, { parca: true, dil }).map((x) => kaydir(x, i + 2));
      parcalar.push({ tur: "ifade", metin: s.slice(i, k + 1), bas: i, son: k + 1, tokenlar: alt });
      i = k + 1;
      duz = i;
      continue;
    }
    if (c === "^" && adBasi(s[i + 1] || "")) {
      duzBitir(i);
      let k = i + 1;
      while (k < s.length && adParcasi(s[k])) k++;
      parcalar.push({ tur: "ad", metin: s.slice(i, k), bas: i, son: k });
      i = k;
      duz = i;
      continue;
    }
    i++;
  }
  if (!kapandi) { duzBitir(i); i = s.length; }
  t.push({ tur: kapandi ? "metin" : "hata", metin: s.slice(bas, i), bas, son: i, parcalar });
  return i;
}

function kaydir(tok, d) {
  const y = { ...tok, bas: tok.bas + d, son: tok.son + d };
  if (tok.parcalar) y.parcalar = tok.parcalar.map((p) => ({ ...p, bas: p.bas + d, son: p.son + d, ...(p.tokenlar ? { tokenlar: p.tokenlar.map((x) => kaydir(x, d)) } : {}) }));
  return y;
}

/** Dosyanın dili: imza (--! lang=) ya da ilk dile özgü anahtar kelime. "tr" | "en" | null */
export function dilBul(kaynak) { return tokenla(kaynak).dil; }

// ---------------------------------------------------------------- renklendirme
const kac = (x) => x.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Kaynağı HTML'e renklendirir: <span class="ms-anahtar"> … (sınıf öneki seçilebilir). Çıktı güvenlidir (kaçışlı). */
export function renklendir(kaynak, { onek = "ms-" } = {}) {
  const yaz = (tokenlar) => tokenlar.map((x) => {
    if (x.tur === "bosluk" || x.tur === "satir") return kac(x.metin);
    if (x.tur === "metin") {
      return `<span class="${onek}metin">~${x.parcalar.map((p) => p.tur === "ifade"
        ? `<span class="${onek}ifade">^(${yaz(p.tokenlar)})</span>`
        : p.tur === "duz" ? kac(p.metin) : `<span class="${onek}${p.tur === "kacis" ? "kacis" : "ifade"}">${kac(p.metin)}</span>`).join("")}~</span>`;
    }
    return `<span class="${onek}${x.tur}">${kac(x.metin)}</span>`;
  }).join("");
  return yaz(tokenla(kaynak));
}

// ---------------------------------------------------------------- çeviri (megc --biçimle --dil'in anahtar kelime kısmı)
/**
 * Dosyayı hedef dile çevirir: anahtar kelimeler + öznitelikler + "--! lang=" imzası; metin içi ^( … ) dahil.
 * 'sistem.' (modül) <-> 'sys.'; EN 'elif' -> TR 'değilse eğer'. Tanımlayıcılar, yorumlar, metinler değişmez.
 */
export function cevir(kaynak, hedef) {
  if (hedef !== "tr" && hedef !== "en") throw new Error("hedef dil 'tr' ya da 'en' olmalı");
  const tokenlar = tokenla(kaynak);
  const hata = tokenlar.find((x) => x.tur === "hata");
  if (hata) throw new Error(`çevrilemez: ${hata.neden || "geçersiz sözdizimi"} (konum ${hata.bas}: '${hata.metin.slice(0, 20)}')`);
  const kaynakDil = tokenlar.dil;
  const duzen = [];
  const gez = (liste) => {
    const anlamli = liste.filter((x) => x.tur !== "bosluk" && x.tur !== "satir" && x.tur !== "yorum");
    anlamli.forEach((x, k) => {
      const sonraki = anlamli[k + 1];
      const noktaGelir = sonraki && sonraki.tur === "islec" && sonraki.metin === ".";
      if (x.tur === "anahtar") {
        let yeni = standartYazim(x.anahtar, hedef);
        if (!yeni && x.anahtar === "Elif" && hedef === "tr") yeni = "değilse eğer";
        if (x.anahtar === "System" && noktaGelir) yeni = hedef === "en" ? "sys" : "sistem";
        if (yeni && yeni !== x.metin) duzen.push([x.bas, x.son, yeni]);
      } else if (x.tur === "oznitelik") {
        const yeni = standartYazim(x.anahtar, hedef, true);
        if (yeni && yeni !== x.metin.slice(1)) duzen.push([x.bas + 1, x.son, yeni]);
      } else if (x.tur === "ad" && x.metin === "sys" && hedef === "tr" && kaynakDil === "en" && noktaGelir) {
        duzen.push([x.bas, x.son, "sistem"]);
      } else if (x.tur === "metin") {
        for (const p of x.parcalar) if (p.tur === "ifade") gez(p.tokenlar);
      }
    });
  };
  gez(tokenlar);
  // imza
  const bom = kaynak.startsWith("﻿") ? 1 : 0;
  const eol = kaynak.indexOf("\n", bom);
  const ilk = kaynak.slice(bom, eol < 0 ? kaynak.length : eol);
  const p = ilk.indexOf("lang=");
  if (ilk.startsWith("--!") && p >= 0) {
    if (ilk.slice(p + 5, p + 7) !== hedef) duzen.push([bom + p + 5, bom + p + 7, hedef]);
  } else {
    duzen.push([bom, bom, `--! lang=${hedef}\n`]);
  }
  duzen.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  let out = kaynak;
  for (const [a, b, y] of duzen) out = out.slice(0, a) + y + out.slice(b);
  return out;
}
