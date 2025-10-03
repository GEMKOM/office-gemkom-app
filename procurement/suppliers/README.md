# Tedarikçiler Sayfası

Bu sayfa, GEMKOM uygulamasının satın alma modülünde tedarikçi yönetimi için tasarlanmıştır.

## Özellikler

### 📊 İstatistik Kartları
- **Tüm Tedarikçiler**: Toplam tedarikçi sayısı
- **Aktif**: Aktif durumda olan tedarikçi sayısı
- **Pasif**: Pasif durumda olan tedarikçi sayısı
- **Toplam**: Sistemdeki toplam tedarikçi sayısı

### 🔍 Filtreleme
- **Tedarikçi Adı**: Tedarikçi adına göre arama
- **İletişim Kişisi**: İletişim kişisine göre arama
- **Durum**: Aktif/Pasif durumuna göre filtreleme
- **Para Birimi**: Varsayılan para birimine göre filtreleme
- **Oluşturulma Tarihi**: Tarih aralığına göre filtreleme

### 📋 Tablo Özellikleri
- **Sıralama**: Tüm sütunlarda artan/azalan sıralama
- **Sayfalama**: 20 kayıt per sayfa
- **Detay Görüntüleme**: Satıra tıklayarak detay modalı
- **Hızlı İşlemler**: Düzenleme ve silme butonları

### ➕ CRUD İşlemleri
- **Yeni Tedarikçi Ekleme**: Modal form ile yeni tedarikçi oluşturma
- **Tedarikçi Düzenleme**: Mevcut tedarikçi bilgilerini güncelleme
- **Tedarikçi Silme**: Tedarikçi kaydını silme
- **Durum Değiştirme**: Aktif/Pasif durumunu değiştirme

## API Entegrasyonu

Sayfa, `apis/procurement.js` dosyasındaki aşağıdaki API fonksiyonlarını kullanır:

- `getSuppliers(filters)` - Tedarikçi listesini getirme
- `getSupplier(id)` - Tek tedarikçi detayını getirme
- `createSupplier(data)` - Yeni tedarikçi oluşturma
- `updateSupplier(id, data)` - Tedarikçi güncelleme
- `deleteSupplier(id)` - Tedarikçi silme
- `toggleSupplierStatus(id)` - Tedarikçi durumunu değiştirme

## Veri Yapısı

Tedarikçi objesi aşağıdaki alanları içerir:

```javascript
{
    "id": 1,
    "name": "Tedarikçi Adı",
    "contact_person": "İletişim Kişisi",
    "phone": "Telefon Numarası",
    "email": "E-posta Adresi",
    "default_currency": "TRY",
    "default_payment_terms": "Ödeme Koşulları",
    "is_active": true,
    "created_at": "2025-01-01T00:00:00Z",
    "updated_at": "2025-01-01T00:00:00Z"
}
```

## Kullanılan Bileşenler

- **HeaderComponent**: Sayfa başlığı ve navigasyon
- **StatisticsCards**: İstatistik kartları
- **FiltersComponent**: Filtreleme arayüzü
- **Bootstrap Modal**: Detay ve form modalları

## Stil Dosyaları

- `suppliers.css`: Sayfa özel stilleri
- `components/badges/badges.css`: Durum rozetleri
- `components/table/table.css`: Tablo stilleri
- `components/filters/filters.css`: Filtre stilleri

## Responsive Tasarım

Sayfa mobil cihazlarda da kullanılabilir şekilde tasarlanmıştır:
- Mobilde tablo yatay kaydırma
- Responsive buton düzenlemeleri
- Mobilde uygun font boyutları

## Gelecek Özellikler

- [ ] Excel/CSV dışa aktarma
- [ ] Toplu işlemler
- [ ] Tedarikçi performans analizi
- [ ] Gelişmiş arama filtreleri
- [ ] Tedarikçi fotoğrafı ekleme
- [ ] Tedarikçi kategorileri
