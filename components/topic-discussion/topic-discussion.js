import {
    getTopic,
    getTopicComments,
    createComment,
    updateComment,
    uploadCommentAttachment,
    uploadTopicAttachment,
    deleteAttachment,
} from '../../apis/projects/topics.js';
import { getUser } from '../../authService.js';
import { showNotification } from '../notification/notification.js';
import { renderRichText } from '../../utils/richText.js';
import { attachRichTextEditor } from '../../utils/richTextEditor.js';
import { getUserInitials, getAvatarColor } from '../../utils/avatar.js';

function formatDateTime(dateString) {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('tr-TR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Comment and topic bodies are user text: escaped, then formatted, by
// utils/richText.js. This used to interpolate `content` straight into
// innerHTML — never render comment text any other way.
function formatContent(content, mentionedUsers = [], mentionedGroups = []) {
    return renderRichText(content, { mentionedUsers, mentionedGroups });
}

function mapAttachment(att) {
    return {
        file_url: att.file_url || att.file || '',
        file_name: att.name || 'Dosya',
        uploaded_at: att.uploaded_at,
        uploaded_by_username: att.uploaded_by || 'Bilinmeyen'
    };
}

async function openFileInViewer(file) {
    const fileName = file.file_name || 'Dosya';
    const fileExtension = file.file_extension
        || (fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '');
    const fileUrl = file.file_url;
    if (!fileUrl) return;

    let viewer = window.fileViewer;
    if (!viewer) {
        const { FileViewer } = await import('../file-viewer/file-viewer.js');
        viewer = new FileViewer();
        window.fileViewer = viewer;
    }
    viewer.setDownloadCallback(async () => {
        await viewer.downloadFile(fileUrl, fileName);
    });
    viewer.openFile(fileUrl, fileName, fileExtension);
}

async function downloadFile(fileUrl, fileName) {
    try {
        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    } catch {
        const link = document.createElement('a');
        link.href = fileUrl;
        link.download = fileName;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

async function mountFileAttachments(containerId, files, options = {}) {
    const container = document.getElementById(containerId);
    if (!container || !files?.length) return;

    const { FileAttachments } = await import('../file-attachments/file-attachments.js');
    const mappedFiles = files.map(mapAttachment);
    const fileAttachments = new FileAttachments(containerId, {
        title: options.title || '',
        showTitle: options.showTitle !== false,
        titleIcon: options.titleIcon || 'fas fa-paperclip',
        titleIconColor: options.titleIconColor || 'text-primary',
        layout: options.layout || 'list',
        maxThumbnailSize: options.maxThumbnailSize || 50,
        onFileClick: openFileInViewer,
        onDownloadClick: downloadFile
    });
    fileAttachments.setFiles(mappedFiles);
}

function renderCommentHtml(comment, currentUsername) {
    const initials = getUserInitials(comment.created_by_name);
    const avatarColor = getAvatarColor(comment.created_by_name);
    const attachmentId = `comment-attachments-${comment.id}`;
    const isAuthor = currentUsername && comment.created_by_username === currentUsername;
    return `
        <div class="comment-item mb-3 pb-3 border-bottom" data-comment-id="${comment.id}">
            <div class="d-flex gap-3">
                <div class="comment-avatar" style="width: 32px; height: 32px; border-radius: 50%; background: ${avatarColor}; color: white; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; flex-shrink: 0;">
                    ${initials}
                </div>
                <div class="flex-grow-1">
                    <div class="d-flex align-items-center gap-2 mb-1">
                        <span class="fw-medium" style="color: #172b4d;">${comment.created_by_name}</span>
                        <span class="text-muted small">${formatDateTime(comment.created_at)}</span>
                        ${comment.is_edited ? '<span class="text-muted small"><i class="fas fa-edit me-1"></i>Düzenlendi</span>' : ''}
                        ${isAuthor ? `<button class="btn btn-link btn-sm p-0 ms-auto text-muted" data-action="edit-comment" data-comment-id="${comment.id}" title="Düzenle" style="line-height:1;"><i class="fas fa-pencil-alt" style="font-size:11px;"></i></button>` : ''}
                    </div>
                    <div class="comment-content rich-text" style="color: #172b4d; margin-bottom: 8px;">
                        ${formatContent(comment.content, comment.mentioned_users_data || [], comment.mentioned_groups_data || [])}
                    </div>
                    ${comment.attachments_data?.length ? `<div class="mt-2" id="${attachmentId}"></div>` : ''}
                </div>
            </div>
        </div>
    `;
}

function setupFilePreview(input, previewEl) {
    const updatePreview = () => {
        const files = Array.from(input.files || []);
        if (!files.length) {
            previewEl.innerHTML = '';
            return;
        }
        previewEl.innerHTML = `
            <div class="d-flex flex-wrap gap-2">
                ${files.map((file, index) => `
                    <span class="badge bg-secondary d-flex align-items-center gap-1">
                        <i class="fas fa-file me-1"></i>${file.name}
                        <button type="button" class="btn-close btn-close-white btn-sm" data-file-index="${index}" style="font-size: 0.7rem;"></button>
                    </span>
                `).join('')}
            </div>
        `;
        previewEl.querySelectorAll('.btn-close').forEach((btn) => {
            btn.addEventListener('click', () => {
                const index = parseInt(btn.getAttribute('data-file-index'), 10);
                const dt = new DataTransfer();
                Array.from(input.files).forEach((f, i) => {
                    if (i !== index) dt.items.add(f);
                });
                input.files = dt.files;
                updatePreview();
            });
        });
    };
    input.addEventListener('change', updatePreview);
    return updatePreview;
}

/**
 * Mount a full discussion panel (topic body, attachments, comments, uploads).
 * @returns {{ refresh: Function, destroy: Function }}
 */
export async function mountTopicDiscussion(rootElement, topicId, options = {}) {
    const prefix = options.prefix || `td-${topicId}`;
    const showTopicBody = options.showTopicBody !== false;
    let destroyed = false;
    let topic = null;
    let comments = [];
    let currentUsername = null;

    const ids = {
        topicAttachments: `${prefix}-topic-attachments`,
        topicUploadInput: `${prefix}-topic-upload-input`,
        topicUploadPreview: `${prefix}-topic-upload-preview`,
        commentsList: `${prefix}-comments-list`,
        commentsCount: `${prefix}-comments-count`,
        commentText: `${prefix}-comment-text`,
        commentFiles: `${prefix}-comment-files`,
        commentFilesPreview: `${prefix}-comment-files-preview`,
        mentionSuggestions: `${prefix}-mention-suggestions`,
        addCommentBtn: `${prefix}-add-comment-btn`,
        topicUploadBtn: `${prefix}-topic-upload-btn`
    };

    async function loadData() {
        [topic, comments] = await Promise.all([
            getTopic(topicId),
            getTopicComments(topicId)
        ]);
    }

    async function initAttachments() {
        if (topic?.attachments_data?.length) {
            await mountFileAttachments(ids.topicAttachments, topic.attachments_data, {
                title: 'Konu Ekleri',
                layout: 'grid'
            });
        }
        for (const comment of comments) {
            if (comment.attachments_data?.length) {
                await mountFileAttachments(`comment-attachments-${comment.id}`, comment.attachments_data, {
                    showTitle: false,
                    layout: 'list',
                    maxThumbnailSize: 50
                });
            }
        }
    }

    function renderCommentsList() {
        const listEl = document.getElementById(ids.commentsList);
        const countEl = document.getElementById(ids.commentsCount);
        if (!listEl) return;
        listEl.innerHTML = comments.length
            ? comments.map((c) => renderCommentHtml(c, currentUsername)).join('')
            : '<p class="text-muted text-center py-4">Henüz yorum yok.</p>';
        if (countEl) countEl.textContent = String(comments.length);
    }

    async function refresh() {
        await loadData();
        renderCommentsList();
        const topicAttachmentsEl = document.getElementById(ids.topicAttachments);
        if (topicAttachmentsEl) topicAttachmentsEl.innerHTML = '';
        await initAttachments();
        options.onRefresh?.(topic, comments);
    }

    function enterEditMode(commentId) {
        const comment = comments.find((c) => c.id === commentId);
        if (!comment) return;
        const commentEl = document.querySelector(`[data-comment-id="${commentId}"]`);
        if (!commentEl || commentEl.querySelector('.comment-edit-form')) return;

        commentEl.querySelector('.comment-content').style.display = 'none';
        const attachmentsEl = document.getElementById(`comment-attachments-${commentId}`);
        if (attachmentsEl) attachmentsEl.style.display = 'none';

        const existingAtts = comment.attachments_data || [];
        const formDiv = document.createElement('div');
        formDiv.className = 'comment-edit-form mt-2';
        formDiv.innerHTML = `
            <div class="position-relative mb-2">
                <textarea class="form-control form-control-sm edit-comment-textarea" rows="3" style="resize:vertical;">${comment.content || ''}</textarea>
                <div class="edit-mention-suggestions mention-suggestions" style="display:none;"></div>
            </div>
            ${existingAtts.length ? `
            <div class="mb-2">
                <div class="small text-muted mb-1">Mevcut Ekler</div>
                <div class="d-flex flex-wrap gap-2">
                    ${existingAtts.map((att) => `
                        <span class="badge bg-secondary d-flex align-items-center gap-1" data-attachment-item data-attachment-id="${att.id}">
                            <i class="fas fa-file me-1"></i>${att.name}
                            <button type="button" class="btn-close btn-close-white btn-sm" data-action="remove-edit-attachment" style="font-size:0.7rem;" title="Kaldır"></button>
                        </span>
                    `).join('')}
                </div>
            </div>` : ''}
            <div class="mb-2">
                <label class="form-label small mb-1"><i class="fas fa-paperclip me-1"></i>Yeni Ekler</label>
                <input type="file" class="form-control form-control-sm edit-new-files" multiple>
                <div class="edit-new-files-preview mt-1"></div>
            </div>
            <div class="d-flex gap-2">
                <button type="button" class="btn btn-sm btn-primary" data-action="save-edit" data-comment-id="${commentId}">
                    <i class="fas fa-check me-1"></i>Kaydet
                </button>
                <button type="button" class="btn btn-sm btn-outline-secondary" data-action="cancel-edit" data-comment-id="${commentId}">
                    İptal
                </button>
            </div>
        `;
        commentEl.querySelector('.flex-grow-1').appendChild(formDiv);

        const textarea = formDiv.querySelector('.edit-comment-textarea');
        attachRichTextEditor(textarea);
        setupFilePreview(formDiv.querySelector('.edit-new-files'), formDiv.querySelector('.edit-new-files-preview'));
        textarea.focus();
    }

    function exitEditMode(commentId) {
        const commentEl = document.querySelector(`[data-comment-id="${commentId}"]`);
        if (!commentEl) return;
        commentEl.querySelector('.comment-content').style.display = '';
        const attachmentsEl = document.getElementById(`comment-attachments-${commentId}`);
        if (attachmentsEl) attachmentsEl.style.display = '';
        commentEl.querySelector('.comment-edit-form')?.remove();
    }

    async function saveEditComment(commentId, saveBtn) {
        const commentEl = document.querySelector(`[data-comment-id="${commentId}"]`);
        const editForm = commentEl?.querySelector('.comment-edit-form');
        if (!editForm) return;

        const newContent = editForm.querySelector('.edit-comment-textarea')?.value?.trim();
        if (!newContent) {
            showNotification('Yorum metni boş olamaz', 'error');
            return;
        }

        const comment = comments.find((c) => c.id === commentId);
        const originalIds = new Set((comment?.attachments_data || []).map((a) => a.id));
        const remainingIds = new Set(
            [...editForm.querySelectorAll('[data-attachment-item]')]
                .map((el) => parseInt(el.dataset.attachmentId, 10))
                .filter((id) => !isNaN(id))
        );
        const idsToDelete = [...originalIds].filter((id) => !remainingIds.has(id));
        const newFiles = Array.from(editForm.querySelector('.edit-new-files')?.files || []);

        const cancelBtn = editForm.querySelector('[data-action="cancel-edit"]');
        saveBtn.disabled = true;
        if (cancelBtn) cancelBtn.disabled = true;

        try {
            await updateComment(commentId, { content: newContent });
            for (const attId of idsToDelete) {
                await deleteAttachment(attId);
            }
            for (const file of newFiles) {
                await uploadCommentAttachment(commentId, file);
            }
            showNotification('Yorum güncellendi', 'success');
            await refresh();
        } catch (error) {
            console.error('Error saving comment edit:', error);
            showNotification('Yorum güncellenirken hata oluştu', 'error');
            saveBtn.disabled = false;
            if (cancelBtn) cancelBtn.disabled = false;
        }
    }

    function bindEvents() {
        attachRichTextEditor(document.getElementById(ids.commentText));

        const commentFileInput = document.getElementById(ids.commentFiles);
        const commentFilePreview = document.getElementById(ids.commentFilesPreview);
        if (commentFileInput && commentFilePreview) {
            setupFilePreview(commentFileInput, commentFilePreview);
        }

        const topicUploadInput = document.getElementById(ids.topicUploadInput);
        const topicUploadPreview = document.getElementById(ids.topicUploadPreview);
        if (topicUploadInput && topicUploadPreview) {
            setupFilePreview(topicUploadInput, topicUploadPreview);
        }

        document.getElementById(ids.topicUploadBtn)?.addEventListener('click', async () => {
            const files = Array.from(topicUploadInput?.files || []);
            if (!files.length) {
                showNotification('Lütfen yüklenecek dosya seçin', 'error');
                return;
            }
            const btn = document.getElementById(ids.topicUploadBtn);
            btn.disabled = true;
            try {
                for (const file of files) {
                    await uploadTopicAttachment(topicId, file);
                }
                showNotification('Dosyalar yüklendi', 'success');
                topicUploadInput.value = '';
                topicUploadPreview.innerHTML = '';
                await refresh();
            } catch (error) {
                console.error('Error uploading topic files:', error);
                showNotification('Dosya yüklenirken hata oluştu', 'error');
            } finally {
                btn.disabled = false;
            }
        });

        document.getElementById(ids.commentsList)?.addEventListener('click', async (e) => {
            const editBtn = e.target.closest('[data-action="edit-comment"]');
            if (editBtn) {
                enterEditMode(parseInt(editBtn.dataset.commentId, 10));
                return;
            }
            const cancelBtn = e.target.closest('[data-action="cancel-edit"]');
            if (cancelBtn) {
                exitEditMode(parseInt(cancelBtn.dataset.commentId, 10));
                return;
            }
            const saveBtn = e.target.closest('[data-action="save-edit"]');
            if (saveBtn && !saveBtn.disabled) {
                await saveEditComment(parseInt(saveBtn.dataset.commentId, 10), saveBtn);
                return;
            }
            const removeAttBtn = e.target.closest('[data-action="remove-edit-attachment"]');
            if (removeAttBtn) {
                removeAttBtn.closest('[data-attachment-item]').remove();
            }
        });

        document.getElementById(ids.addCommentBtn)?.addEventListener('click', async () => {
            const commentText = commentTextarea?.value?.trim();
            if (!commentText) {
                showNotification('Lütfen yorum metni girin', 'error');
                return;
            }
            const btn = document.getElementById(ids.addCommentBtn);
            btn.disabled = true;
            try {
                const commentResponse = await createComment({ topic: topicId, content: commentText });
                const files = Array.from(commentFileInput?.files || []);
                if (files.length) {
                    try {
                        for (const file of files) {
                            await uploadCommentAttachment(commentResponse.id, file);
                        }
                    } catch (fileError) {
                        console.error('Error uploading comment files:', fileError);
                        showNotification('Yorum eklendi ancak bazı dosyalar yüklenemedi', 'warning');
                    }
                }
                showNotification('Yorum eklendi', 'success');
                if (commentTextarea) commentTextarea.value = '';
                if (commentFileInput) {
                    commentFileInput.value = '';
                    if (commentFilePreview) commentFilePreview.innerHTML = '';
                }
                await refresh();
            } catch (error) {
                console.error('Error adding comment:', error);
                showNotification('Yorum eklenirken hata oluştu', 'error');
            } finally {
                btn.disabled = false;
            }
        });
    }

    await loadData();
    try {
        const user = await getUser();
        currentUsername = user?.username || null;
    } catch {
        // proceed without edit buttons if user can't be fetched
    }
    if (destroyed) return { refresh: async () => {}, destroy: () => {} };

    rootElement.innerHTML = `
        <div class="topic-discussion">
            ${showTopicBody && topic?.content ? `
                <div class="mb-3">
                    <h6 class="mb-2"><i class="fas fa-align-left me-2"></i>Konu İçeriği</h6>
                    <div class="p-3 bg-light rounded rich-text">
                        ${formatContent(topic.content, topic.mentioned_users_data || [], topic.mentioned_groups_data || [])}
                    </div>
                </div>
            ` : ''}
            <div class="mb-3">
                <h6 class="mb-2"><i class="fas fa-paperclip me-2"></i>Konu Ekleri</h6>
                <div id="${ids.topicAttachments}" class="mb-2"></div>
                <div class="border rounded p-3 bg-light">
                    <label class="form-label small mb-1">Dosya Yükle</label>
                    <input type="file" class="form-control form-control-sm mb-2" id="${ids.topicUploadInput}" multiple>
                    <div id="${ids.topicUploadPreview}" class="mb-2"></div>
                    <button type="button" class="btn btn-sm btn-outline-primary" id="${ids.topicUploadBtn}">
                        <i class="fas fa-upload me-1"></i>Yükle
                    </button>
                </div>
            </div>
            <div class="mb-2">
                <h6 class="mb-3">
                    <i class="fas fa-comments me-2"></i>Yorumlar (<span id="${ids.commentsCount}">${comments.length}</span>)
                </h6>
                <div id="${ids.commentsList}" class="mb-4" style="max-height: 320px; overflow-y: auto;">
                    ${comments.length
                        ? comments.map((c) => renderCommentHtml(c, currentUsername)).join('')
                        : '<p class="text-muted text-center py-4">Henüz yorum yok.</p>'}
                </div>
                <div class="border-top pt-3">
                    <div class="position-relative mb-2">
                        <textarea id="${ids.commentText}" class="form-control" rows="3"
                            placeholder="Yorum yazın... (@ile kullanıcı etiketleyin)" style="resize: vertical;"></textarea>
                        <div id="${ids.mentionSuggestions}" class="mention-suggestions" style="display: none;"></div>
                    </div>
                    <div class="mb-2">
                        <label class="form-label small">
                            <i class="fas fa-paperclip me-1"></i>Yorum Ekleri (Opsiyonel)
                        </label>
                        <input type="file" class="form-control form-control-sm" id="${ids.commentFiles}" multiple>
                        <div id="${ids.commentFilesPreview}" class="mt-1"></div>
                    </div>
                    <button type="button" class="btn btn-sm btn-primary" id="${ids.addCommentBtn}">
                        <i class="fas fa-paper-plane me-1"></i>Yorum Ekle
                    </button>
                </div>
            </div>
        </div>
    `;

    bindEvents();
    setTimeout(() => initAttachments(), 50);

    return {
        refresh,
        destroy: () => {
            destroyed = true;
            rootElement.innerHTML = '';
        }
    };
}
