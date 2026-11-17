// MegscriptVM blogu: en yenisi en üstte. Yeni yazı = dizinin başına bir öğe. Metinde `ters tırnak` kod olur.
// Bloklar: ["p", metin] paragraf · ["h", metin] ara başlık · ["kod", metin] kod kutusu · ["liste", [..]] madde · ["ipucu", metin]
const BLOG = [
  {
    slug: "kod-defteri", tarih: "2026-11-15", okuma: 3, etiket: "Yeni özellik",
    baslik: "Kod defteri geldi: sunucunu hücre hücre yaz",
    ozet: "Sunucuna tıkla, defteri açılsın. Altyapı hücresi, adlandırılmış kod hücreleri ve canlı çıktı; hepsi 7/24.",
    govde: [
      ["p", "Artık her sunucunun bir kod defteri var. Sunucu kartına tıkladığında defter açılır; kodunu tek bir uzun dosya yerine adlandırdığın hücrelere bölerek yazarsın."],
      ["h", "Altyapı hücresi"],
      ["p", "Defterin en üstündeki hücre zorunludur ve yerinden oynamaz. `âleme_bağla` satırlarını, sabitleri (`mühür`), portu ve bütün hücrelerin kullanacağı ortak ayinleri buraya yaz. Program her açılışta önce bu hücreyi çalıştırır."],
      ["h", "Adlandırılmış hücreler"],
      ["liste", [
        "Her hücreye bir ad ver: `oyuncular`, `sohbet`, `ana-döngü`… Hata çıkınca hangi hücrede olduğunu adıyla görürsün.",
        "“Çalışsın” anahtarını kapatırsan hücre programa girmez; kodu silinmez, istediğin an geri açarsın.",
        "Hücreleri yukarı aşağı taşıyabilir, aralarına yenisini ekleyebilirsin. Son kod hücresi silinmez.",
      ]],
      ["h", "Kaydet ve çalıştır"],
      ["p", "`Ctrl+S` ya da bir hücredeyken `Shift+Enter`: açık hücreler yukarıdan aşağıya tek program olarak sunucunda başlar. Sağdaki Çıktı panelinde programın yazdıkları canlı akar. Bir hata olursa ilgili hücre kırmızıya döner ve altında satır numarasıyla hata yazar."],
      ["ipucu", "Sekmeyi ya da bilgisayarını kapatman sunucuyu durdurmaz. 7/24 bekçi açıksa program çökse bile kendiliğinden yeniden başlar."],
    ],
  },
  {
    slug: "ilk-sunucu", tarih: "2026-11-15", okuma: 4, etiket: "Rehber",
    baslik: "İlk sunucunu 5 dakikada kur",
    ozet: "Ad ver, defteri aç, iki hücre yaz, çalıştır. Adım adım ilk 7/24 sunucun.",
    govde: [
      ["h", "1. Sunucuyu oluştur"],
      ["p", "Sağ üstteki “Yeni sunucu” düğmesine bas. Sunucuna bir ad ver; oyuncuların bağlanacağı bir port varsa onu da yaz (ör. 7777). Not alanı kartında görünür. “Oluştur ve defteri aç”a basınca defter açılır."],
      ["h", "2. Altyapıyı yaz"],
      ["p", "Altyapı hücresine programın her yerinde kullanacağın şeyleri koy:"],
      ["kod", "mühür SELAM = ~Sunucu açıldı~"],
      ["h", "3. Ana döngüyü yaz"],
      ["p", "İlk kod hücresine bir ad ver (ör. `ana-döngü`) ve sürekli çalışan kısmı yaz:"],
      ["kod", "yayınla(SELAM)\nçağır tur = 0\niken gerçek ~>\n    tur = tur + 1\n    yayınla(~tur ^tur~)\n    bekle 1 sn\n|"],
      ["h", "4. Çalıştır"],
      ["p", "`Ctrl+S`'ye bas. Çıktı panelinde önce “Sunucu açıldı”, ardından her saniye bir satır görürsün. Port verdiysen değeri kodda `sistem.argümanlar[0]` ile gelir."],
      ["ipucu", "Yazdığın her şey sunucunun içinde çalışır: oyun kuralları, oyuncu kayıtları, sohbet… Hazır şablon yok; sunucu tamamen senin."],
    ],
  },
  {
    slug: "yedi-yirmi-dort", tarih: "2026-11-15", okuma: 2, etiket: "Altyapı",
    baslik: "Sunucun 7/24 nasıl açık kalır?",
    ozet: "Bekçi, kalıcılık ve bakım pencereleri: sunucun sen yokken de neden çalışmaya devam ediyor.",
    govde: [
      ["p", "MegscriptVM'de sunucular senin bilgisayarında değil, bizim bulut düğümümüzde çalışır. Paneli kapatman, internetinin kesilmesi ya da bilgisayarını kapatman sunucunu etkilemez."],
      ["h", "Bekçi"],
      ["p", "7/24 bekçi açıksa sunucun durduğunda ya da çöktüğünde bekçi onu artan aralıklarla yeniden başlatır. Kartındaki “kaldırdı” sayısı bekçinin kaç kez devreye girdiğini gösterir."],
      ["h", "Kalıcılık"],
      ["p", "Bulut düğümü yeniden açılsa bile hangi sunucuların çalışması gerektiğini hatırlar ve onları kaldığı yerden yeniden başlatır."],
      ["h", "Bakım pencereleri"],
      ["p", "Sunucular şimdilik her gece 03.00'te bakım için kapatılıp sabah yeniden açılıyor; ayrıca haftada bir 04.00–04.15 arasında kısa bir otomatik bakım var. Bu sürede makinelerin güvenle saklanır ve açılınca kendiliğinden devam eder."],
    ],
  },
  {
    slug: "motor-hizlandi", tarih: "2026-11-15", okuma: 3, etiket: "Motor",
    baslik: "Motor hızlandı: Lua'ya yaklaştık",
    ozet: "Sunucularının üstünde çalıştığı mscript motoru baştan hızlandı; bazı işlerde Lua'yı bile geçiyor.",
    govde: [
      ["p", "Sunucularının kodunu çalıştıran mscript motorunu yazmaç tabanlı bir sanal makineye taşıdık. Kodun aynı kaldı; yalnız daha hızlı çalışıyor."],
      ["liste", [
        "Metin işleme Lua'dan daha hızlı, liste işlemleri Lua ile neredeyse aynı.",
        "Sayı ağırlıklı testlerde Lua'nın 1,4–2 katı sürede bitiyor; önceki motora göre kat kat hızlı.",
        "Windows'ta da büyük hızlanma var.",
      ]],
      ["h", "Daha güvenli"],
      ["p", "Birbirini gösteren nesnelerdeki bellek sızıntısı kapatıldı ve derlenmiş bayt kodu çalışmadan önce doğrulanıyor: bozuk ya da kurcalanmış dosya hiç çalıştırılmaz."],
    ],
  },
  {
    slug: "guvenlik", tarih: "2026-11-15", okuma: 2, etiket: "Güvenlik",
    baslik: "Hesabın ve kodun nasıl korunuyor?",
    ozet: "İmzalı istekler, e-posta doğrulama, gizlenen adresler: arka planda neler oluyor.",
    govde: [
      ["liste", [
        "Panelle sunucuların arasındaki her istek imzalıdır; imzasız ya da tekrar gönderilen istek reddedilir.",
        "Oturum çerezin tarayıcıdaki betiklere kapalıdır. Şifreni değiştirince ya da Hesabım'dan “Diğer cihazlardan çıkış”a basınca öteki oturumlar düşer.",
        "E-posta değişikliği 6 haneli kodla doğrulanır; eski adresine bildirim gider.",
        "Günlüklerde ve ekranda hiçbir IP adresi ya da sunucu klasörü görünmez.",
        "Kart bilgin yalnız ödeme sağlayıcısının sayfasında girilir, bize hiç gelmez.",
      ]],
      ["ipucu", "Hesabında tanımadığın bir değişiklik görürsen Hesabım > Güvenlik'ten diğer cihazlardan çıkış yap ve şifreni sıfırla."],
    ],
  },
];
