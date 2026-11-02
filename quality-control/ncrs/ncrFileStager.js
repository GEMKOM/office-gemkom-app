/**
 * "Ekler" block for the NCR create / edit modals: files are picked (or dropped) and
 * typed here, then uploaded once the NCR itself has been saved — a new NCR has no id
 * to upload against until then.
 *
 * Deliberately avoids EditModal's .field-group / .field-input classes so the modal's
 * validation and getFormData() ignore it.
 */
import { escapeHtml } from '../../../utils/text.js';
import { NCR_FILE_TYPE_OPTIONS, uploadNCRFile } from '../../../apis/qualityControl.js';
import { numberedSectionTitle } from './ncrForm.js';

function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(name, mime = '') {
    const ext = String(name).split('.').pop().toLowerCase();
    if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(ext)) return 'fa-file-image';
    if (ext === 'pdf') return 'fa-file-pdf';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return 'fa-file-excel';
    if (['doc', 'docx'].includes(ext)) return 'fa-file-word';
    if (['dwg', 'dxf', 'step', 'stp'].includes(ext)) return 'fa-drafting-compass';
    return 'fa-file';
}

function defaultFileType(file) {
    return file.type.startsWith('image/') ? 'photo' : 'other';
}

/**
 * Append the Ekler section to an EditModal's form.
 * @param {HTMLFormElement} form          EditModal.form (cleared by clearAll on next open)
 * @param {Object}  [opts]
 * @param {Array}   [opts.existingFiles]  already-attached files (edit mode), shown read-only
 * @returns {{ getStaged: () => Array<{file: File, fileType: string}> }}
 */
export function mountNcrFileStager(form, { existingFiles = [] } = {}) {
    const staged = [];
    const section = document.createElement('div');
    section.className = 'form-section compact mb-3 ncr-stager';

    const existingHtml = existingFiles.length
        ? `<div class="ncr-stager-existing">
               <div class="ncr-stager-caption">Mevcut ekler (${existingFiles.length})</div>
               ${existingFiles.map(f => `
                   <div class="ncr-stager-row is-existing">
                       <i class="fas ${fileIcon(f.name)}"></i>
                       <span class="ncr-stager-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
                       <span class="ncr-stager-meta">${escapeHtml(f.typeLabel || '')}</span>
                   </div>`).join('')}
               <div class="ncr-stager-hint">Mevcut ekleri NCR detayındaki Ekler bölümünden silebilirsiniz.</div>
           </div>`
        : '';

    section.innerHTML = `
        <h6 class="section-subtitle compact">${numberedSectionTitle(7, 'Ekler')}</h6>
        <div class="ncr-stager-body">
            ${existingHtml}
            <div class="ncr-stager-drop" tabindex="0">
                <i class="fas fa-cloud-upload-alt"></i>
                <div><strong>Dosyaları buraya sürükleyin</strong> veya <span class="ncr-stager-link">seçin</span></div>
                <div class="ncr-stager-hint">Fotoğraf, çizim, rapor… Birden fazla dosya eklenebilir. Kaydettiğinizde yüklenir.</div>
                <input type="file" multiple hidden>
            </div>
            <div class="ncr-stager-list"></div>
        </div>`;
    form.appendChild(section);

    const drop = section.querySelector('.ncr-stager-drop');
    const input = section.querySelector('input[type="file"]');
    const list = section.querySelector('.ncr-stager-list');

    const typeOptions = (selected) => NCR_FILE_TYPE_OPTIONS
        .map(o => `<option value="${o.value}"${o.value === selected ? ' selected' : ''}>${escapeHtml(o.label)}</option>`)
        .join('');

    const renderList = () => {
        if (!staged.length) {
            list.innerHTML = '';
            return;
        }
        list.innerHTML = `
            <div class="ncr-stager-caption">Yüklenecek dosyalar (${staged.length})</div>
            ${staged.map((item, index) => `
                <div class="ncr-stager-row" data-index="${index}">
                    <i class="fas ${fileIcon(item.file.name, item.file.type)}"></i>
                    <span class="ncr-stager-name" title="${escapeHtml(item.file.name)}">${escapeHtml(item.file.name)}</span>
                    <span class="ncr-stager-meta">${formatSize(item.file.size)}</span>
                    <select class="form-select form-select-sm ncr-stager-type" aria-label="Dosya türü">${typeOptions(item.fileType)}</select>
                    <button type="button" class="btn btn-sm btn-link text-danger ncr-stager-remove" title="Kaldır"><i class="fas fa-times"></i></button>
                </div>`).join('')}`;
    };

    const addFiles = (fileList) => {
        Array.from(fileList || []).forEach(file => {
            const duplicate = staged.some(s => s.file.name === file.name && s.file.size === file.size);
            if (!duplicate) staged.push({ file, fileType: defaultFileType(file) });
        });
        renderList();
    };

    drop.addEventListener('click', () => input.click());
    input.addEventListener('click', (e) => e.stopPropagation()); // don't re-enter the drop zone's handler
    drop.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            input.click();
        }
    });
    input.addEventListener('change', () => {
        addFiles(input.files);
        input.value = '';
    });
    ['dragenter', 'dragover'].forEach(evt => drop.addEventListener(evt, (e) => {
        e.preventDefault();
        drop.classList.add('is-dragover');
    }));
    ['dragleave', 'drop'].forEach(evt => drop.addEventListener(evt, (e) => {
        e.preventDefault();
        drop.classList.remove('is-dragover');
    }));
    drop.addEventListener('drop', (e) => addFiles(e.dataTransfer?.files));

    list.addEventListener('change', (e) => {
        const row = e.target.closest('.ncr-stager-row');
        if (row && e.target.classList.contains('ncr-stager-type')) {
            staged[Number(row.dataset.index)].fileType = e.target.value;
        }
    });
    list.addEventListener('click', (e) => {
        const btn = e.target.closest('.ncr-stager-remove');
        if (!btn) return;
        staged.splice(Number(btn.closest('.ncr-stager-row').dataset.index), 1);
        renderList();
    });

    return { getStaged: () => staged.slice() };
}

/** Upload staged files one by one; never throws, so the caller can report partial success. */
export async function uploadStagedFiles(ncrId, staged) {
    let uploaded = 0;
    const failed = [];
    for (const { file, fileType } of staged) {
        try {
            await uploadNCRFile(ncrId, file, fileType);
            uploaded += 1;
        } catch (error) {
            console.error(`Error uploading ${file.name}:`, error);
            failed.push(file.name);
        }
    }
    return { uploaded, failed };
}
