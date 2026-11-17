// MegscriptVM istemcisi (JavaScript): panelin konuştuğu API'nin karşılığı. Tarayıcıda ve Node 18+'da çalışır;
// bağımlılık yok (fetch). Yerel konsol (http://localhost:8090) ya da bulut paneli (oturum çerezi) ile kullanılır.
//
//   import { MegscriptVM } from "megscriptvm";
//   const vm = new MegscriptVM({ adres: "http://localhost:8090" });
//   await vm.olustur({ ad: "lobi", kod, port: 25565, kademe: 2 });
//   const durdur = vm.oyunculariIzle("lobi", (o) => console.log(o.sayi, o.adlar));   // gerçek zamanlı
//
// Sunucu kodu oyuncularını sistem.oyuncular(...) ile bildirirse sayı GERÇEKTİR (kaynak "sunucu"); bildirmezse konsol
// porta açık TCP bağlantılarından tahmin eder (kaynak "tahmini").

export class MegscriptVMHatasi extends Error {
  constructor(ileti, durum, veri) {
    super(ileti);
    this.name = "MegscriptVMHatasi";
    this.durum = durum;            // HTTP durum kodu (0: ağ hatası)
    this.veri = veri || {};        // konsolun JSON yanıtı ({ hata, plan, giris, motor_yok ... })
  }
}

export class MegscriptVM {
  /**
   * @param {object} [s]
   * @param {string} [s.adres]   konsol kökü ("" = aynı köken, panel içinde), ör. "http://localhost:8090"
   * @param {Function} [s.fetch] fetch uygulaması (sınama ya da eski Node için)
   */
  constructor({ adres = "", fetch: f } = {}) {
    this.adres = adres.replace(/\/+$/, "");
    this._fetch = f || globalThis.fetch?.bind(globalThis);
    if (!this._fetch) throw new Error("fetch yok: Node 18+ kullan ya da { fetch } ver");
  }

  async _istek(yol, { yontem = "GET", sorgu, form } = {}) {
    const q = sorgu ? "?" + new URLSearchParams(sorgu).toString() : "";
    const ayar = { method: yontem, cache: "no-store", credentials: "same-origin", headers: {} };
    if (yontem === "POST") {
      ayar.headers["Content-Type"] = "application/x-www-form-urlencoded";
      ayar.headers["X-MscriptVM"] = "1";        // konsolun CSRF koruması: yalnız bu başlıkla gelen POST kabul edilir
      ayar.body = new URLSearchParams(form || {}).toString();
    }
    let r;
    try { r = await this._fetch(this.adres + yol + q, ayar); }
    catch (e) { throw new MegscriptVMHatasi(`Konsola ulaşılamadı: ${e.message}`, 0); }
    let j = {};
    try { j = await r.json(); } catch { /* boş gövde */ }
    if (!r.ok) throw new MegscriptVMHatasi(j.hata || `Konsol hata verdi (${r.status}).`, r.status, j);
    return j;
  }

  // ---- okuma
  /** Genel durum: çalışan/toplam sunucu, toplam bellek, toplam_oyuncu, oyuncu_tahmini, ana makine, olaylar */
  ozet() { return this._istek("/api/ozet"); }
  /** Bütün sunucular (her biri: ad, durum, kademe, port, bellek_kb, oyuncu, oyuncular, oyuncu_kaynak, ...) */
  sunucular() { return this._istek("/api/ornekler"); }
  /** Tek sunucu (yoksa null) */
  async sunucu(ad) { return (await this.sunucular()).find((o) => o.ad === ad) || null; }
  /** Sunucunun megscript kaynak kodu */
  kod(ad) { return this._istek("/api/kod", { sorgu: { ad } }); }
  /** Son günlük satırları (n: 10..2000) */
  gunluk(ad, n = 300) { return this._istek("/api/gunluk", { sorgu: { ad, n: String(n) } }); }

  /** Aktif oyuncular: { sayi, adlar, kaynak: "sunucu" | "tahmini" | "yok", tepe } */
  async oyuncular(ad) {
    const o = await this.sunucu(ad);
    if (!o) throw new MegscriptVMHatasi(`'${ad}' adında bir sunucu yok.`, 404);
    return oyuncuDurumu(o);
  }

  // ---- yazma
  /**
   * Koddan sunucu kur (hazır şablon yok). ad: 1–32 karakter (harf, rakam, _ -).
   * @param {object} a
   * @param {string} a.ad @param {string} a.kod megscript kaynağı
   * @param {number} [a.port=0] @param {number} [a.kademe=0] 0 otomatik, 1..5 @param {number} [a.islemci=0]
   * @param {"katı"|"esnek"} [a.politika="katı"] sanal VRAM politikası
   * @param {string} [a.not=""] @param {boolean} [a.otomatik=true] çökerse yeniden başlat @param {boolean} [a.baslat=true]
   */
  olustur({ ad, kod, port = 0, kademe = 0, islemci = 0, politika = "katı", not = "", otomatik = true, baslat = true }) {
    return this._istek("/api/olustur", {
      yontem: "POST",
      form: { ad, kod, port: String(port), kademe: String(kademe), işlemci: String(islemci), politika, not,
              otomatik: otomatik ? "1" : "0", başlat: baslat ? "1" : "0" },
    });
  }
  /** Ayarları ya da kodu güncelle (verilmeyen alanlar konsolda varsayılana döner: tam ayar ver) */
  guncelle(ad, { kod, port = 0, kademe = 0, islemci = 0, politika = "katı", not = "", otomatik = true }) {
    const form = { port: String(port), kademe: String(kademe), işlemci: String(islemci), politika, not, otomatik: otomatik ? "1" : "0" };
    if (kod !== undefined) form.kod = kod;
    return this._istek("/api/guncelle", { yontem: "POST", sorgu: { ad }, form });
  }
  baslat(ad) { return this._istek("/api/baslat", { yontem: "POST", sorgu: { ad } }); }
  yeniden(ad) { return this._istek("/api/yeniden", { yontem: "POST", sorgu: { ad } }); }
  durdur(ad) { return this._istek("/api/durdur", { yontem: "POST", sorgu: { ad } }); }
  /** Bekçi: çökerse yeniden başlatılsın mı */
  otomatik(ad, acik) { return this._istek("/api/otomatik", { yontem: "POST", sorgu: { ad, deger: acik ? "1" : "0" } }); }
  sil(ad) { return this._istek("/api/sil", { yontem: "POST", sorgu: { ad } }); }

  // ---- gerçek zamanlı
  /**
   * Oyuncu listesini izler; sayı ya da adlar değişince geriCagri({ sayi, adlar, kaynak, tepe }) çağrılır
   * (ilk okumada da). Tarayıcıda sekme arka plandan dönünce beklemeden yeniden okur. Dönen işlev izlemeyi durdurur.
   */
  oyunculariIzle(ad, geriCagri, { aralik = 2000, hata = () => {} } = {}) {
    let son = null, dur = false, zaman = null, okunuyor = false;
    const oku = async () => {
      if (dur || okunuyor) return;
      okunuyor = true;
      try {
        const d = await this.oyuncular(ad);
        const imza = JSON.stringify([d.sayi, d.adlar, d.kaynak]);
        if (imza !== son) { son = imza; geriCagri(d); }
      } catch (e) { hata(e); }
      finally { okunuyor = false; }
    };
    const dongu = async () => { await oku(); if (!dur) zaman = setTimeout(dongu, aralik); };
    const gorunur = () => { if (typeof document !== "undefined" && !document.hidden) oku(); };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", gorunur);
    dongu();
    return () => {
      dur = true;
      clearTimeout(zaman);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", gorunur);
    };
  }
}

/** Konsolun sunucu kaydından oyuncu durumu (eski konsol kaynak göndermez: "tahmini" sayılır) */
export function oyuncuDurumu(o) {
  const calisiyor = o.durum === "çalışıyor";
  return {
    sayi: calisiyor ? o.oyuncu || 0 : 0,
    adlar: calisiyor && Array.isArray(o.oyuncular) ? o.oyuncular : [],
    kaynak: calisiyor ? o.oyuncu_kaynak || "tahmini" : "yok",
    tepe: o.oyuncu_tepe || 0,
  };
}
