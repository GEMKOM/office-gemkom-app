# Finans Modülü

Bu modül, GEMKOM iç sisteminin finansal süreçlerini yönetmek için tasarlanmıştır.

## Modül Yapısı

```
finance/
├── index.html              # Ana finans sayfası
├── finance.js              # Finans modülü JavaScript dosyası
├── finance-badges.css      # Finans modülü özel CSS stilleri
└── README.md               # Bu dosya
```

## Özellikler

### 1. Faturalar
- **Gelen Faturalar**: Tedarikçilerden gelen faturaların yönetimi
- **Giden Faturalar**: Müşterilere gönderilen faturaların yönetimi
- **Onay Süreçleri**: Fatura onay süreçlerinin takibi

### 2. Ödemeler
- **Ödeme Planları**: Ödeme planlarının oluşturulması ve takibi
- **Nakit Akışı**: Nakit akışı analizi ve yönetimi
- **Banka İşlemleri**: Banka işlemlerinin takibi

### 3. Bütçe
- **Bütçe Planlama**: Bütçe planlarının oluşturulması
- **Bütçe Takibi**: Bütçe performansının izlenmesi
- **Performans Analizi**: Bütçe performans analizi

### 4. Muhasebe
- **Defter Tutma**: Muhasebe kayıtlarının tutulması
- **İşlem Kayıtları**: Finansal işlemlerin kaydedilmesi
- **Finansal Raporlar**: Muhasebe raporlarının oluşturulması

### 5. Vergi
- **Vergi Hesaplamaları**: Vergi hesaplamalarının yapılması
- **Beyanname Takibi**: Vergi beyannamelerinin takibi
- **Uyumluluk**: Vergi uyumluluğunun kontrolü

### 6. Maliyet Analizi
- **Üretim Maliyetleri**: Üretim maliyetlerinin analizi
- **Karlılık Analizi**: Karlılık hesaplamaları
- **Maliyet Dağılımı**: Maliyetlerin dağılım analizi

### 7. Raporlar
- **Finansal Raporlar**: Temel finansal raporlar
- **Analitik Raporlar**: Detaylı analitik raporlar
- **Finansal Dashboard**: Finansal durum özeti

### 8. Ayarlar
- **Genel Ayarlar**: Modül genel ayarları
- **Yetki Yönetimi**: Kullanıcı yetkilerinin yönetimi
- **Entegrasyon**: Dış sistem entegrasyonları

## Teknik Detaylar

### Kullanılan Teknolojiler
- HTML5
- CSS3 (Bootstrap 5.3.0)
- JavaScript (ES6+)
- Font Awesome 6.4.0

### Dosya Yapısı
- `index.html`: Ana sayfa yapısı ve modül kartları
- `finance.js`: Modül JavaScript fonksiyonları
- `finance-badges.css`: Modül özel stilleri

### Navigasyon
Modül, ana navbar'a entegre edilmiştir ve aşağıdaki yapıyı kullanır:
- `/finance` - Ana finans sayfası
- `/finance/invoices` - Fatura yönetimi
- `/finance/payments` - Ödeme yönetimi
- `/finance/budget` - Bütçe yönetimi
- `/finance/accounting` - Muhasebe işlemleri
- `/finance/tax` - Vergi işlemleri
- `/finance/cost-analysis` - Maliyet analizi
- `/finance/reports` - Raporlar
- `/finance/settings` - Ayarlar

## Geliştirme Notları

- Modül, diğer GEMKOM modülleriyle aynı tasarım dilini kullanır
- Responsive tasarım ile mobil uyumludur
- Bootstrap grid sistemi kullanılarak oluşturulmuştur
- Font Awesome ikonları kullanılmıştır
- Modüler yapı sayesinde kolayca genişletilebilir

## Gelecek Geliştirmeler

- [ ] Fatura oluşturma ve düzenleme sayfaları
- [ ] Ödeme planı oluşturma araçları
- [ ] Bütçe planlama araçları
- [ ] Muhasebe entegrasyonu
- [ ] Vergi hesaplama araçları
- [ ] Maliyet analizi araçları
- [ ] Rapor oluşturma araçları
- [ ] Dashboard widget'ları
