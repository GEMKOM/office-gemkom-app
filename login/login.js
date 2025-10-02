// login/login.js
import { login, navigateTo, ROUTES, shouldBeOnLoginPage, navigateByTeamIfFreshLogin } from '../authService.js';
import { forgotPassword } from '../apis/users.js';

// Enhanced error handling and display
function showError(message) {
    const errorMessage = document.getElementById('error-message');
    const errorText = document.getElementById('error-text');
    
    if (errorMessage && errorText) {
        errorText.textContent = message;
        errorMessage.classList.remove('fade');
        errorMessage.style.display = 'flex';
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            hideError();
        }, 5000);
    }
}

function hideError() {
    const errorMessage = document.getElementById('error-message');
    if (errorMessage) {
        errorMessage.classList.add('fade');
        setTimeout(() => {
            errorMessage.style.display = 'none';
        }, 300);
    }
}

// Forbidden access modal
function showForbiddenModal() {
    // Add modal-open class to body to prevent scrolling
    document.body.classList.add('modal-open');
    
    // Create modal HTML
    const modalHTML = `
        <div id="forbidden-modal" class="forbidden-modal">
            <div class="forbidden-modal-content">
                <div class="forbidden-modal-header">
                    <h2>⚠️ Erişim Reddedildi</h2>
                </div>
                <div class="forbidden-modal-body">
                    <p>Bu sisteme erişim yetkiniz bulunmamaktadır.</p>
                    <p>Yönlendiriliyorsunuz...</p>
                </div>
                <div class="forbidden-modal-footer">
                    <button id="forbidden-ok-btn" class="forbidden-ok-btn">
                        TAMAM (<span id="countdown">5</span>)
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Start countdown
    let countdown = 5;
    const countdownElement = document.getElementById('countdown');
    const okButton = document.getElementById('forbidden-ok-btn');
    
    const countdownInterval = setInterval(() => {
        countdown--;
        if (countdownElement) {
            countdownElement.textContent = countdown;
        }
        
        if (countdown <= 0) {
            clearInterval(countdownInterval);
            redirectToSaha();
        }
    }, 1000);
    
    // Handle OK button click
    if (okButton) {
        okButton.addEventListener('click', () => {
            clearInterval(countdownInterval);
            redirectToSaha();
        });
    }
}

function redirectToSaha() {
    window.location.href = 'https://saha.gemcore.com.tr';
}

// Enhanced loading state management
function setLoadingState(isLoading, buttonId = 'login-button') {
    const loginButton = document.getElementById(buttonId);
    const btnText = loginButton?.querySelector('.btn-text');
    const btnLoading = loginButton?.querySelector('.btn-loading');
    
    if (loginButton && btnText && btnLoading) {
        if (isLoading) {
            loginButton.disabled = true;
            btnText.style.display = 'none';
            btnLoading.style.display = 'flex';
        } else {
            loginButton.disabled = false;
            btnText.style.display = 'flex';
            btnLoading.style.display = 'none';
        }
    }
}

// Forgot password functionality
function showForgotPasswordError(message) {
    const errorElement = document.getElementById('forgot-password-error');
    const errorText = document.getElementById('forgot-password-error-text');
    const successElement = document.getElementById('forgot-password-success');
    
    if (errorElement && errorText) {
        // Hide success message if visible
        if (successElement) {
            successElement.style.display = 'none';
        }
        
        errorText.textContent = message;
        errorElement.style.display = 'flex';
        errorElement.classList.remove('fade');
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            hideForgotPasswordError();
        }, 5000);
    }
}

function hideForgotPasswordError() {
    const errorElement = document.getElementById('forgot-password-error');
    if (errorElement) {
        errorElement.classList.add('fade');
        setTimeout(() => {
            errorElement.style.display = 'none';
        }, 300);
    }
}

function showForgotPasswordSuccess(message) {
    const successElement = document.getElementById('forgot-password-success');
    const successText = document.getElementById('forgot-password-success-text');
    const errorElement = document.getElementById('forgot-password-error');
    
    if (successElement && successText) {
        // Hide error message if visible
        if (errorElement) {
            errorElement.style.display = 'none';
        }
        
        successText.textContent = message;
        successElement.style.display = 'flex';
        successElement.classList.remove('fade');
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            hideForgotPasswordSuccess();
        }, 5000);
    }
}

function hideForgotPasswordSuccess() {
    const successElement = document.getElementById('forgot-password-success');
    if (successElement) {
        successElement.classList.add('fade');
        setTimeout(() => {
            successElement.style.display = 'none';
        }, 300);
    }
}

function setForgotPasswordLoadingState(isLoading) {
    const submitButton = document.getElementById('forgot-password-submit');
    const btnText = submitButton?.querySelector('.btn-text');
    const btnLoading = submitButton?.querySelector('.btn-loading');
    
    if (submitButton && btnText && btnLoading) {
        if (isLoading) {
            submitButton.disabled = true;
            btnText.style.display = 'none';
            btnLoading.style.display = 'flex';
        } else {
            submitButton.disabled = false;
            btnText.style.display = 'flex';
            btnLoading.style.display = 'none';
        }
    }
}

async function handleForgotPassword(username) {
    try {
        const response = await forgotPassword(username);
        
        if (response.ok) {
            showForgotPasswordSuccess('Şifre sıfırlama isteğiniz yöneticinize iletildi.');
            // Clear the form
            document.getElementById('forgot-username').value = '';
            // Close modal after a delay
            setTimeout(() => {
                const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('forgotPasswordModal'));
                modal.hide();
            }, 2000);
        } else {
            showForgotPasswordSuccess('Şifre sıfırlama isteğiniz yöneticinize iletildi.');
        }
    } catch (error) {
        console.error('Forgot password error:', error);
        showForgotPasswordError('Bağlantı hatası. Lütfen tekrar deneyin.');
    } finally {
        setForgotPasswordLoadingState(false);
    }
}

function setupForgotPasswordModal() {
    const forgotPasswordLink = document.getElementById('forgot-password-link');
    const forgotPasswordModal = document.getElementById('forgotPasswordModal');
    const forgotPasswordForm = document.getElementById('forgot-password-form');
    const forgotPasswordSubmit = document.getElementById('forgot-password-submit');
    
    // Open modal when link is clicked
    if (forgotPasswordLink && forgotPasswordModal) {
        forgotPasswordLink.addEventListener('click', (e) => {
            e.preventDefault();
            const modal = bootstrap.Modal.getOrCreateInstance(forgotPasswordModal);
            modal.show();
        });
    }
    
    // Handle form submission
    if (forgotPasswordForm && forgotPasswordSubmit) {
        forgotPasswordForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleForgotPasswordSubmit();
        });
        
        forgotPasswordSubmit.addEventListener('click', (e) => {
            e.preventDefault();
            handleForgotPasswordSubmit();
        });
    }
    
    // Clear form when modal is hidden
    if (forgotPasswordModal) {
        forgotPasswordModal.addEventListener('hidden.bs.modal', () => {
            forgotPasswordForm.reset();
            hideForgotPasswordError();
            hideForgotPasswordSuccess();
        });
    }
}

function handleForgotPasswordSubmit() {
    const usernameInput = document.getElementById('forgot-username');
    const username = usernameInput.value.trim();
    
    // Hide any existing messages
    hideForgotPasswordError();
    hideForgotPasswordSuccess();
    
    // Validate input
    if (!username) {
        showForgotPasswordError('Lütfen kullanıcı adınızı girin.');
        usernameInput.focus();
        return;
    }
    
    // Set loading state
    setForgotPasswordLoadingState(true);
    
    // Submit request
    handleForgotPassword(username);
}

// Password toggle functionality
function setupPasswordToggle() {
    const toggleButton = document.getElementById('toggle-password');
    const passwordInput = document.getElementById('password');
    
    if (toggleButton && passwordInput) {
        toggleButton.addEventListener('click', () => {
            const type = passwordInput.type === 'password' ? 'text' : 'password';
            passwordInput.type = type;
            
            const icon = toggleButton.querySelector('i');
            if (icon) {
                icon.className = type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
            }
        });
    }
}

// Enhanced form validation
function validateForm() {
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    
    if (!usernameInput.value.trim()) {
        showError('Lütfen kullanıcı adınızı girin.');
        usernameInput.focus();
        return false;
    }
    
    if (!passwordInput.value.trim()) {
        showError('Lütfen şifrenizi girin.');
        passwordInput.focus();
        return false;
    }
    
    return true;
}

// Enhanced login process with better UX
async function handleLogin(username, password) {
    try {
        await login(username, password);
        const user = JSON.parse(localStorage.getItem('user'));
        
        // Add a small delay for better UX
        await new Promise(resolve => setTimeout(resolve, 500));
        
        if (user.must_reset_password) {
            navigateTo(ROUTES.RESET_PASSWORD);
        } else {
            navigateByTeamIfFreshLogin();
        }
    } catch (error) {
        console.error('Login error:', error);
        
        if (error.message === 'FORBIDDEN') {
            showForbiddenModal();
        } else {
            showError('Kullanıcı adı veya şifre hatalı. Lütfen tekrar deneyin.');
        }
        setLoadingState(false);
    }
}

// Main initialization
document.addEventListener('DOMContentLoaded', async () => {
    // Check if user should be on this page
    if (!shouldBeOnLoginPage()) {
        navigateByTeamIfFreshLogin();
        return;
    }

    // Initialize password toggle
    setupPasswordToggle();

    // Initialize forgot password modal
    setupForgotPasswordModal();

    // Form submission handler
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // Hide any existing errors
            hideError();
            
            // Validate form
            if (!validateForm()) {
                return;
            }
            
            const usernameInput = document.getElementById('username');
            const passwordInput = document.getElementById('password');
            
            const username = usernameInput.value.trim();
            const password = passwordInput.value;
            
            // Set loading state
            setLoadingState(true);
            
            // Attempt login
            await handleLogin(username, password);
        });
    }

    // Add keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.target.matches('input')) {
            const loginButton = document.getElementById('login-button');
            if (loginButton && !loginButton.disabled) {
                loginButton.click();
            }
        }
    });
});
