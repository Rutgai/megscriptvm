// Tek başına sayfalar (şifre, koşullar, gizlilik) panelde seçilen temayla açılsın.
try {
  const t = localStorage.getItem("mscriptvm-tema");
  if (t === "acik" || t === "koyu") document.documentElement.dataset.tema = t;
} catch (e) { /* özel pencere */ }
