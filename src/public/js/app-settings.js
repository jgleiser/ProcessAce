document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('appSettingsForm');
    const providerSelect = document.getElementById('providerSelect');
    const modelInput = document.getElementById('modelInput');
    const saveBtn = document.getElementById('saveBtn');
    const messageContainer = document.getElementById('messageContainer');

    function showMessage(type, text) {
        messageContainer.innerHTML = `<div style="padding: 1rem; margin-bottom: 1rem; border-radius: 8px; background: ${type === 'error' ? 'rgba(255, 82, 82, 0.1)' : 'rgba(0, 230, 118, 0.1)'}; color: ${type === 'error' ? 'var(--error)' : 'var(--success)'}; border: 1px solid ${type === 'error' ? 'var(--error)' : 'var(--success)'};">${text}</div>`;
    }

    // Verify Admin and Load Settings
    try {
        const authRes = await fetch('/api/auth/me');
        if (!authRes.ok) {
            window.location.href = '/login.html';
            return;
        }
        const user = await authRes.json();
        if (user.role !== 'admin') {
            document.body.innerHTML = '<div style="color:white; text-align:center; padding:2rem;">Access Denied</div>';
            return;
        }

        const settingsRes = await fetch('/api/settings');
        if (settingsRes.ok) {
            const settings = await settingsRes.json();
            if (settings['llm.provider']) providerSelect.value = settings['llm.provider'];
            if (settings['llm.model']) modelInput.value = settings['llm.model'];
        }
    } catch (err) {
        console.error(err);
        showMessage('error', 'Failed to load settings');
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        try {
            // Save Provider
            await fetch('/api/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'llm.provider', value: providerSelect.value })
            });

            // Save Model
            await fetch('/api/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'llm.model', value: modelInput.value })
            });

            showMessage('success', 'Settings saved successfully');
        } catch (err) {
            console.error(err);
            showMessage('error', 'Failed to save settings');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Changes';
        }
    });
});
