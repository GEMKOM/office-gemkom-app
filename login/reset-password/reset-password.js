import { authedFetch, navigateTo, ROUTES, shouldBeOnResetPasswordPage, getUser } from '../../authService.js';
import { backendBase } from '../../base.js';

document.addEventListener('DOMContentLoaded', function() {
    // Check if user should be on this page
    if (!shouldBeOnResetPasswordPage()) {
        navigateTo(ROUTES.HOME);
        return;
    }

    const form = document.getElementById('reset-password-form');
    const newPasswordInput = document.getElementById('new-password');
    const confirmPasswordInput = document.getElementById('confirm-password');
    const errorDiv = document.getElementById('reset-error');
    const successDiv = document.getElementById('reset-success');

    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        errorDiv.style.display = 'none';
        successDiv.style.display = 'none';
        const newPassword = newPasswordInput.value.trim();
        const confirmPassword = confirmPasswordInput.value.trim();

        if (newPassword.length < 6) {
            errorDiv.textContent = 'Şifre en az 6 karakter olmalıdır.';
            errorDiv.style.display = 'block';
            return;
        }
        if (newPassword !== confirmPassword) {
            errorDiv.textContent = 'Şifreler eşleşmiyor.';
            errorDiv.style.display = 'block';
            return;
        }
        try {
            const res = await authedFetch(`${backendBase}/users/reset-password/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ new_password: newPassword })
            });
            if (res.ok) {
                // Update the user data in localStorage to reflect the password reset
                try {
                    const updatedUser = await getUser();
                    // Ensure must_reset_password is set to false after successful reset
                    updatedUser.must_reset_password = false;
                    localStorage.setItem('user', JSON.stringify(updatedUser));
                } catch (userError) {
                    console.warn('Failed to refresh user data after password reset:', userError);
                    // Fallback: manually update the cached user data
                    const cachedUser = JSON.parse(localStorage.getItem('user') || '{}');
                    cachedUser.must_reset_password = false;
                    localStorage.setItem('user', JSON.stringify(cachedUser));
                }
                
                successDiv.textContent = 'Şifreniz başarıyla güncellendi. Ana sayfaya yönlendiriliyorsunuz...';
                successDiv.style.display = 'block';
                
                // Clear the form
                form.reset();
                
                setTimeout(() => {
                    // Force navigation to home page
                    window.location.href = ROUTES.HOME;
                }, 1500);
            } else {
                const data = await res.json().catch(() => ({}));
                errorDiv.textContent = data.message || 'Şifre güncellenemedi. Lütfen tekrar deneyin.';
                errorDiv.style.display = 'block';
            }
        } catch (err) {
            errorDiv.textContent = 'Bir hata oluştu. Lütfen tekrar deneyin.';
            errorDiv.style.display = 'block';
        }
    });
}); 