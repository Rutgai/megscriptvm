// MegscriptVM panel kapısı. Panel bu sitede değil, MegscriptVM'in kendi bilgisayarında çalışır ve dışarıya
// adresi her açılışta değişen bir tünelle açılır; bilgisayar güncel adresi /adres.json'a yazar. Bu betik paneli
// sayfayı kaplayan bir çerçevede (iframe) açar, böylece adres çubuğunda hep megscriptvm.js.org görünür:
//   megscriptvm.js.org/            -> <panel>/        (giriş ekranı)
//   megscriptvm.js.org/panel/...   -> <panel>/...     (e-postadaki bağlantılar: /panel/sifre#t=.., /panel/#yonetim)
// Oturum: çerçevede üçüncü taraf çerezi çalışmadığı için oturum jetonu BU sitenin belleğinde (localStorage) durur;
// panelin gomulu.js'i postMessage ile ister, saklatır ve siler. Yalnız o anki panel kökeniyle konuşulur.
// Panel kapalıysa 15 sn'de bir yeniden dener. Tünel yeniden açılınca eski adres Cloudflare 1033 hata sayfası verir:
// adres.json 30 sn'de bir okunur, adres değişmişse çerçeve kendiliğinden yeni tünele taşınır. Çerçeve yüklenip
// panel hiç "mvm-merhaba" demediyse (hata sayfası) adres.json hemen yeniden okunur.
(() => {
  const ON = "/panel";
  const ANAHTAR = "mvm-oturum";
  const y = location.pathname;
  const kok = y === "/" || y === "/index.html";
  if (!(kok || y === ON || y.startsWith(ON + "/"))) return;
  const $ = (id) => document.getElementById(id);
  const bellek = {
    al() { try { return localStorage.getItem(ANAHTAR) || ""; } catch (e) { return ""; } },
    yaz(v) { try { localStorage.setItem(ANAHTAR, v); } catch (e) { /* özel pencere: oturum sayfa ömrü kadar */ } },
    sil() { try { localStorage.removeItem(ANAHTAR); } catch (e) { /* yok */ } },
  };
  let gecici = "";                                   // localStorage yazılamazsa (özel pencere) bu sayfa açıkken
  function hedefYol() {
    let h = kok ? "/" : y.slice(ON.length);
    if (h === "" || h === "/index.html") h = "/";
    return h + location.search + location.hash;
  }
  function hedefYolGuncel() {                        // çerçeve açıldıktan sonra: adres çubuğundaki yol + #parça
    const p = location.pathname.startsWith(ON + "/") ? location.pathname.slice(ON.length) : "/";
    return (p === "/index.html" ? "/" : p) + location.hash;
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

  let f = null, koken = "", suAnki = "", yuklemeSaati = 0, selamVar = false, geciyor = false, sonOkuma = 0;
  function mesaj(e) {
    if (!f || e.origin !== koken || e.source !== f.contentWindow || !e.data || typeof e.data !== "object") return;
    const d = e.data;
    if (d.tur === "mvm-merhaba") { selamVar = true; f.contentWindow.postMessage({ tur: "mvm-jeton", jeton: bellek.al() || gecici }, koken); }
    else if (d.tur === "mvm-jeton-kaydet" && typeof d.jeton === "string" && d.jeton.length < 2000) { gecici = d.jeton; bellek.yaz(d.jeton); }
    else if (d.tur === "mvm-jeton-sil") { gecici = ""; bellek.sil(); }
    else if (d.tur === "mvm-adres") {
      // adres çubuğu: panelin #parçası (jetonlu parça gelmez). Yenileyince aynı sayfa açılır.
      const parca = typeof d.parca === "string" && /^#[\w\-\/%.]{0,200}$/.test(d.parca) ? d.parca : "";
      const yol = d.yol === "/sifre" ? "/panel/sifre" : "/";
      history.replaceState(null, "", yol + parca);
      if (typeof d.baslik === "string" && d.baslik) document.title = d.baslik.slice(0, 120);
    }
  }
  function cerceveAc(adres) {
    suAnki = adres; koken = new URL(adres).origin; selamVar = false; yuklemeSaati = 0; sonOkuma = Date.now();
    if (f) { f.src = adres + hedefYolGuncel(); return; }   // yeni tünel: aynı sayfa yeni adreste; jeton bu sitede
    const s = document.createElement("style");
    s.textContent = "html,body{margin:0;height:100%;overflow:hidden}#panelCerceve{position:fixed;inset:0;width:100%;height:100%;border:0;display:block;background:#09090d}";
    document.head.appendChild(s);
    f = document.createElement("iframe");
    f.id = "panelCerceve";
    f.title = "MegscriptVM Panel";
    f.allow = "clipboard-write";
    f.addEventListener("load", () => { yuklemeSaati = Date.now(); });
    window.addEventListener("message", mesaj);
    f.src = adres + hedefYol();
    // e-postadaki #t=... jetonu çerçeveye geçti; bu sayfanın adres çubuğunda ve geçmişinde kalmasın
    if (/(^|[#&])t=/.test(location.hash)) history.replaceState(null, "", location.pathname);
    document.body.replaceChildren(f);
    setInterval(denetle, 5000);
  }
  async function denetle() {
    if (geciyor) return;
    const simdi = Date.now();
    const olu = yuklemeSaati > 0 && !selamVar && simdi - yuklemeSaati > 8000;   // hata sayfası (1033 vb.)
    if (!olu && simdi - sonOkuma < 30000) return;
    sonOkuma = simdi; geciyor = true;
    try {
      const adres = await adresAl();
      if (adres && adres !== suAnki) { if (await ulasilir(adres)) cerceveAc(adres); }
      else if (olu) { yuklemeSaati = 0; f.src = suAnki + hedefYolGuncel(); }   // aynı adres: yeniden dene
    } catch (e) { /* sonraki turda */ }
    finally { geciyor = false; }
  }
  async function dene() {
    try {
      const adres = await adresAl();
      if (adres && await ulasilir(adres)) { cerceveAc(adres); return; }
    } catch (e) { /* aşağıda yeniden denenir */ }
    if ($("kapali")) $("kapali").hidden = false;
    if ($("durum")) $("durum").textContent = "Bağlanılamadı; 15 saniye sonra yeniden denenecek.";
    setTimeout(dene, 15000);
  }
  dene();
})();
