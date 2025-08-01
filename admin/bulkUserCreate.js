import { backendBase } from '../base.js';
import { authedFetch } from '../authService.js';

export function showBulkUserCreateForm() {
    const mainContent = document.querySelector('.admin-main-content .container-fluid');
    if (!mainContent) return;
    mainContent.innerHTML = `
      <div class="row justify-content-center mt-4">
        <div class="col-md-8">
          <div class="card">
            <div class="card-header"><b>Çoklu Kullanıcı Ekle</b></div>
            <div class="card-body">
              <form id="bulk-user-form">
                <div class="mb-3">
                  <label for="bulk-names" class="form-label">İsimler (her satıra bir isim veya virgülle ayırın)</label>
                  <textarea class="form-control" id="bulk-names" rows="8" placeholder="Ör: BÜLENT AYDIN\nORHAN ÇELİK\n..."></textarea>
                </div>
                <div class="mb-3">
                  <label for="bulk-team" class="form-label">Takım</label>
                  <input type="text" class="form-control" id="bulk-team" placeholder="Takım adı" />
                </div>
                <button type="submit" class="btn btn-primary">Gönder</button>
                <div id="bulk-user-result" class="mt-3"></div>
              </form>
            </div>
          </div>
        </div>
      </div>
    `;
    const form = document.getElementById('bulk-user-form');
    form.onsubmit = async (e) => {
        e.preventDefault();
        const namesRaw = document.getElementById('bulk-names').value;
        const team = document.getElementById('bulk-team').value.trim();
        const resultDiv = document.getElementById('bulk-user-result');
        let names = namesRaw.split(/\n|,/).map(n => n.trim()).filter(n => n);
        if (!names.length || !team) {
            resultDiv.innerHTML = '<span class="text-danger">Lütfen isimleri ve takımı girin.</span>';
            return;
        }
        resultDiv.innerHTML = 'Gönderiliyor...';
        try {
            const res = await authedFetch(`${backendBase}/users/admin/bulk-create-user/`, {
                method: 'POST',
                body: JSON.stringify({ names, team })
            });
            if (res.ok) {
                resultDiv.innerHTML = '<span class="text-success">Kullanıcılar başarıyla eklendi!</span>';
                form.reset();
            } else {
                const err = await res.text();
                resultDiv.innerHTML = `<span class="text-danger">Hata: ${err}</span>`;
            }
        } catch (error) {
            resultDiv.innerHTML = `<span class="text-danger">Sunucu hatası.</span>`;
        }
    };
} 