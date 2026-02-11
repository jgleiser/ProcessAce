/**
 * Show toast notification
 * @param {string} message 
 * @param {string} type 'success' | 'error' | 'info'
 */
function showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    // Add icon based on type
    const icon = document.createElement('span');
    icon.style.marginRight = '8px';
    if (type === 'success') icon.textContent = '✅';
    else if (type === 'error') icon.textContent = '❌';
    else icon.textContent = 'ℹ️';

    toast.prepend(icon);

    document.body.appendChild(toast);

    // Animation
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translate(-50%, 0)';
    });

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translate(-50%, 20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
