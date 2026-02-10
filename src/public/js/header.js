/**
 * Shared Header Logic
 * Handles User Menu Dropdown and Auth Display
 */
document.addEventListener('DOMContentLoaded', async () => {
    const userDisplay = document.getElementById('userDisplay');
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userDropdown = document.getElementById('userDropdown');
    const logoutBtn = document.getElementById('logoutBtn');
    const adminLink = document.getElementById('adminLink');
    const adminJobsLink = document.getElementById('adminJobsLink');
    const appSettingsLink = document.getElementById('appSettingsLink');

    // Toggle Dropdown
    if (userMenuBtn && userDropdown) {
        userMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            userDropdown.classList.toggle('hidden');
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (!userMenuBtn.contains(e.target) && !userDropdown.contains(e.target)) {
                userDropdown.classList.add('hidden');
            }
        });
    }

    // Logout
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await fetch('/api/auth/logout', { method: 'POST' });
                window.location.href = '/login.html';
            } catch (err) {
                console.error('Logout failed', err);
            }
        });
    }

    // Auth Check & UI Update
    // Only run if not already handled by page-specific logic (or run in parallel/idempotent)
    // We'll trust this script to handle the header parts.
    try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
            const user = await res.json();
            if (userDisplay) userDisplay.textContent = user.email;

            // Show Admin Links
            if (user.role === 'admin') {
                if (adminLink) adminLink.style.display = 'block';
                if (adminJobsLink) adminJobsLink.style.display = 'block';
                if (appSettingsLink) appSettingsLink.style.display = 'block';
            }
        } else {
            // Not authenticated - redirect to login unless on public page (which we don't really have)
            // But let's check if we are on a protected page.
            if (window.location.pathname !== '/login.html' && window.location.pathname !== '/register.html') {
                // window.location.href = '/login.html'; // Let page specific logic handle redirect if needed or uncomment
            }
        }
    } catch (err) {
        console.error('Auth verification failed', err);
    }
});
