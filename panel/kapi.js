// MegscriptVM panel kapısı: panel bu sitede değil, MegscriptVM'in kendi bilgisayarında çalışır ve dışarıya
// adresi her açılışta değişen bir tünelle açılır. Bilgisayar her açılışta güncel adresi /adres.json'a yazar;
// bu betik onu okuyup ziyaretçiyi panele aktarır:
//   megscriptvm.js.org/            -> <panel>/        (giriş ekranı)
//   megscriptvm.js.org/panel/...   -> <panel>/...     (e-postadaki bağlantılar: /panel/sifre#t=.., /panel/#yonetim)
// Sorgu ve #parça aynen taşınır. Panel kapalıysa 15 sn'de bir yeniden dener.
(() => {
  const ON = "/panel";
  const y = location.pathname;
  const kok = y === "/" || y === "/index.html";
  if (!(kok || y === ON || y.startsWith(ON + "/"))) return;
  const $ = (id) => document.getElementById(id);
  function hedefYol() {
    let h = kok ? "/" : y.slice(ON.length);
    if (h === "" || h === "/index.html") h = "/";
    return h + location.search + location.hash;
  }
  async function adresAl() {
    const r = await fetch("/adres.json?t=" + Date.now(), { cache: "no-store" });
    const j = await r.json();
    return /^https:\/\/[a-z0-9.-]+$/.test(j.adres || "") ? j.adres : null;
  }
  async function ulasilir(adres) {
    const k = new AbortController(); const z = setTimeout(() => k.abort(), 8000);
    try { await fetch(adres + "/simge.png?t=" + Date.now(), { mode: "no-cors", cache: "no-store", signal: k.signal }); return true; }
    catch (e) { return false; } finally { clearTimeout(z); }
  }
  async function dene() {
    try {
      const adres = await adresAl();
      if (adres && await ulasilir(adres)) { location.replace(adres + hedefYol()); return; }
    } catch (e) { /* aşağıda yeniden denenir */ }
    if ($("kapali")) $("kapali").hidden = false;
    if ($("durum")) $("durum").textContent = "Bağlanılamadı; 15 saniye sonra yeniden denenecek.";
    setTimeout(dene, 15000);
  }
  dene();
})();
