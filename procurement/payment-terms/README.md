# Ödeme Koşulları Sayfası

Bu sayfa, GEMKOM uygulamasının satın alma modülünde ödeme koşulları yönetimi için tasarlanmıştır.

## Özellikler

### 📊 İstatistik Kartları
- **Tüm Ödeme Koşulları**: Toplam ödeme koşulu sayısı
- **Aktif**: Aktif durumda olan ödeme koşulu sayısı
- **Pasif**: Pasif durumda olan ödeme koşulu sayısı
- **Özel**: Özel türdeki ödeme koşulu sayısı

### 🔍 Filtreleme
- **Ödeme Koşulu Adı**: Ödeme koşulu adına göre arama
- **Kod**: Ödeme koşulu koduna göre arama
- **Tür**: Standart/Özel türüne göre filtreleme
- **Durum**: Aktif/Pasif durumuna göre filtreleme
- **Oluşturulma Tarihi**: Tarih aralığına göre filtreleme

### 📋 Tablo Özellikleri
- **Sıralama**: Tüm sütunlarda artan/azalan sıralama
- **Sayfalama**: 20 kayıt per sayfa
- **Detay Görüntüleme**: Satıra tıklayarak detay modalı
- **Düzenleme**: Satır içi düzenleme butonu
- **Silme**: Satır içi silme butonu

### 💳 Ödeme Detayları
- **Çoklu Ödeme Satırları**: Her ödeme koşulu için birden fazla ödeme satırı
- **Yüzde Bazlı**: Her satır için yüzde oranı
- **Temel Seçenekleri**: Peşin, Teslimde, Faturadan sonra
- **Gecikme Günleri**: Her satır için gecikme günü tanımlama

## Veri Yapısı

### Ödeme Koşulu
```json
{
    "id": 1,
    "name": "100% Peşin",
    "code": "advance_100",
    "is_custom": false,
    "active": true,
    "default_lines": [
        {
            "basis": "immediate",
            "label": "Peşin",
            "percentage": 100.0,
            "offset_days": 0
        }
    ],
    "created_at": "2025-08-20T19:44:46.964553Z",
    "updated_at": "2025-08-20T19:44:46.964578Z"
}
```

### Ödeme Satırı
```json
{
    "basis": "immediate",        // immediate, after_delivery, after_invoice
    "label": "Peşin",           // Görüntülenecek etiket
    "percentage": 100.0,        // Yüzde oranı (0-100)
    "offset_days": 0            // Gecikme günü
}
```

## Temel Seçenekleri

- **immediate**: Peşin ödeme
- **after_delivery**: Teslimden sonra ödeme
- **after_invoice**: Faturadan sonra ödeme

## API Endpoints

- **GET** `/procurement/payment-terms/` - Ödeme koşulları listesi
- **GET** `/procurement/payment-terms/{id}/` - Tek ödeme koşulu
- **POST** `/procurement/payment-terms/` - Yeni ödeme koşulu oluştur
- **PUT** `/procurement/payment-terms/{id}/` - Ödeme koşulu güncelle
- **DELETE** `/procurement/payment-terms/{id}/` - Ödeme koşulu sil
- **POST** `/procurement/payment-terms/{id}/toggle_status/` - Durum değiştir

## Kullanım

### Yeni Ödeme Koşulu Oluşturma
1. "Yeni Ödeme Koşulu" butonuna tıklayın
2. Ad ve kod bilgilerini girin
3. Tür seçin (Standart/Özel)
4. Durum seçin (Aktif/Pasif)
5. Ödeme satırları ekleyin:
   - Etiket girin (örn: "Peşin", "Teslimde")
   - Yüzde oranı girin (0-100)
   - Temel seçin (Peşin/Teslimde/Faturadan sonra)
   - Gecikme günü girin (varsa)
6. "Kaydet" butonuna tıklayın

### Ödeme Koşulu Düzenleme
1. Tabloda düzenlemek istediğiniz satırın düzenleme butonuna tıklayın
2. Form otomatik olarak mevcut verilerle doldurulur
3. Gerekli değişiklikleri yapın
4. "Kaydet" butonuna tıklayın

### Ödeme Koşulu Silme
1. Tabloda silmek istediğiniz satırın silme butonuna tıklayın
2. Onay mesajında "Tamam" seçin
3. Ödeme koşulu kalıcı olarak silinir

### Durum Değiştirme
1. Ödeme koşulu detaylarını görüntüleyin
2. "Durumu Değiştir" butonuna tıklayın
3. Onay mesajında "Tamam" seçin
4. Durum aktif/pasif arasında değişir

## Özellikler

### 🎨 Görsel Tasarım
- Modern ve temiz arayüz
- Responsive tasarım (mobil uyumlu)
- Bootstrap 5 tabanlı
- Font Awesome ikonları

### ⚡ Performans
- Sayfalama ile hızlı yükleme
- Lazy loading
- Optimized API calls
- Caching desteği

### 🔒 Güvenlik
- Authentication kontrolü
- CSRF koruması
- Input validation
- XSS koruması

### 📱 Mobil Uyumluluk
- Responsive tablo tasarımı
- Touch-friendly butonlar
- Mobil optimizasyonu
- Tablet desteği

## Teknik Detaylar

### Dosya Yapısı
```
procurement/payment-terms/
├── index.html          # Ana HTML dosyası
├── payment-terms.js    # JavaScript fonksiyonları
├── payment-terms.css   # CSS stilleri
└── README.md          # Bu dosya
```

### Bağımlılıklar
- Bootstrap 5.3.0
- Font Awesome 6.4.0
- Custom components (navbar, header, filters, statistics-cards)

### Tarayıcı Desteği
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Geliştirme Notları

### Yeni Özellik Ekleme
1. API endpoint'ini `generic/procurement.js`'e ekleyin
2. JavaScript fonksiyonunu `payment-terms.js`'e ekleyin
3. HTML elementini `index.html`'e ekleyin
4. CSS stillerini `payment-terms.css`'e ekleyin

### Hata Ayıklama
- Console logları aktif
- Error handling mevcut
- User-friendly hata mesajları
- Loading states

### Test Senaryoları
- CRUD operasyonları
- Filtreleme ve sıralama
- Responsive tasarım
- Form validation
- Error handling
