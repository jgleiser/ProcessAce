/**
 * Artifact Viewer
 * Handles viewing and editing artifacts (BPMN, SIPOC, RACI, Narrative) inside a modal.
 */
/* global marked, BpmnJS, EasyMDE */

window.ArtifactViewer = (function () {
  let modal, modalTitle, modalBody, closeModal;
  let bpmnInstance = null;
  let easyMDEInstance = null;
  let currentArtifactId = null;
  let currentArtifactContent = null;
  let currentArtifactType = null;
  let currentCanEdit = false;

  function openArtifactModal() {
    modal.classList.remove('hidden');
    history.pushState({ modalOpen: true }, '');
  }

  function closeArtifactModal() {
    destroyBpmn();
    destroyDocEditor();
    if (!modal.classList.contains('hidden')) {
      modal.classList.add('hidden');
    }
  }

  async function viewArtifact(id, type, canEdit) {
    const modalContent = document.querySelector('#artifactModal .modal-content');
    if (type === 'bpmn') {
      modalContent.classList.add('modal-content-expanded');
    } else {
      modalContent.classList.remove('modal-content-expanded');
    }

    openArtifactModal();
    modalBody.innerHTML = '<div class="spinner spinner-centered"></div>';
    modalTitle.textContent = `Viewing ${type.toUpperCase()}`;

    try {
      const res = await window.apiClient.request(`/api/artifacts/${id}/content?view=true`);

      // apiClient.request returns JSON if application/json, else text/blob. It uses `.json()` auto parsing.
      // Wait, we used `fetch` originally and checked headers.
      // Let's use direct pull since we don't know what apiClient returned exactly
      const response = await fetch(`/api/artifacts/${id}/content?view=true`);
      if (!response.ok) throw new Error('Failed to load content');

      let content;
      const contentType = response.headers.get('content-type');

      if (contentType.includes('application/json')) {
        content = await response.json();
      } else {
        content = await response.text();
      }

      currentCanEdit = canEdit;
      renderModalContent(type, content, id, canEdit);
    } catch (err) {
      modalBody.innerHTML = `<p class="text-error">Error loading artifact: ${err.message}</p>`;
    }
  }

  function renderModalContent(type, content, artifactId, canEdit = false) {
    currentArtifactId = artifactId;
    currentArtifactContent = content;
    currentArtifactType = type;

    if (type === 'bpmn') {
      modalBody.innerHTML = `
                <div class="bpmn-controls">
                    <div id="viewControls" class="bpmn-controls-group">
                        ${canEdit ? `<button class="bpmn-btn primary" id="editBpmn">Edit Diagram</button>` : ''}
                        <button class="bpmn-btn primary" id="resetZoom">Fit to View</button>
                        <div class="dropdown-wrapper">
                            <button class="bpmn-btn primary" id="exportBpmnBtn">Export ▼</button>
                            <div id="bpmnExportMenu" class="dropdown-menu hidden">
                                <a href="#" id="exportBpmnXml" class="dropdown-menu-item">BPMN XML</a>
                                <a href="#" id="exportBpmnPng" class="dropdown-menu-item">PNG Image</a>
                                <a href="#" id="exportBpmnSvg" class="dropdown-menu-item">SVG Image</a>
                            </div>
                        </div>
                    </div>
                    <div id="editControls" class="bpmn-controls-group hidden">
                        <button class="bpmn-btn primary" id="saveBpmn">Save Changes</button>
                        <button class="bpmn-btn" id="cancelEdit">Cancel</button>
                    </div>
                </div>
                <div id="bpmn-canvas"></div>
            `;

      loadBpmnViewer(content);

      const exportBtn = document.getElementById('exportBpmnBtn');
      const exportMenu = document.getElementById('bpmnExportMenu');
      if (exportBtn) {
        exportBtn.onclick = (e) => {
          e.stopPropagation();
          exportMenu.classList.toggle('hidden');
        };
        window.addEventListener('click', () => {
          if (exportMenu && !exportMenu.classList.contains('hidden'))
            exportMenu.classList.add('hidden');
        });
      }

      document.getElementById('exportBpmnXml').onclick = (e) => {
        e.preventDefault();
        downloadBpmnXml();
      };
      document.getElementById('exportBpmnPng').onclick = (e) => {
        e.preventDefault();
        downloadBpmnPng();
      };
      document.getElementById('exportBpmnSvg').onclick = (e) => {
        e.preventDefault();
        downloadSvg();
      };
    } else if (type === 'sipoc' || type === 'raci') {
      if (!Array.isArray(content)) {
        modalBody.innerHTML = '<pre>' + JSON.stringify(content, null, 2) + '</pre>';
        return;
      }
      const isSipoc = type === 'sipoc';
      let html = `
                <div class="table-controls table-controls-bar">
                    ${canEdit ? `<button class="bpmn-btn primary" id="btn-edit-table">Edit ${isSipoc ? 'SIPOC' : 'RACI'}</button>` : ''}
                    <button class="bpmn-btn primary btn-export-csv" id="btn-export-csv">Export CSV</button>
                    <div id="editTableControls" class="bpmn-controls-group hidden">
                         <button class="bpmn-btn primary" id="btn-add-row">+ Add Row</button>
                         <button class="bpmn-btn primary" id="btn-save-table">Save Changes</button>
                         <button class="bpmn-btn" id="btn-cancel-table">Cancel</button>
                    </div>
                </div>
                <div id="table-container">
            `;

      const headers = isSipoc
        ? ['Supplier', 'Input', 'Process', 'Output', 'Customer']
        : ['Activity', 'Responsible', 'Accountable', 'Consulted', 'Informed'];

      const keys = isSipoc
        ? ['supplier', 'input', 'process_step', 'output', 'customer']
        : ['activity', 'responsible', 'accountable', 'consulted', 'informed'];

      html += `<table class="data-table" id="viewTable"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>`;

      content.forEach((row) => {
        html += '<tr>';
        keys.forEach((key) => (html += `<td>${row[key] || ''}</td>`));
        html += '</tr>';
      });
      html += '</tbody></table></div>';
      modalBody.innerHTML = html;

      const editBtn = document.getElementById('btn-edit-table');
      if (editBtn) editBtn.addEventListener('click', () => switchToTableEditMode(type));

      const exportBtn = document.getElementById('btn-export-csv');
      if (exportBtn) exportBtn.addEventListener('click', () => downloadTableCsv(type));

      const addBtn = document.getElementById('btn-add-row');
      if (addBtn) addBtn.addEventListener('click', () => addTableRow(type));

      const saveBtn = document.getElementById('btn-save-table');
      if (saveBtn) saveBtn.addEventListener('click', () => saveTableChanges(type));

      const cancelBtn = document.getElementById('btn-cancel-table');
      if (cancelBtn) cancelBtn.addEventListener('click', cancelTableEdit);
    } else if (type === 'doc') {
      if (typeof marked === 'undefined') {
        modalBody.innerHTML = '<p class="text-error">Error: Marked library not loaded.</p>';
        return;
      }
      modalBody.innerHTML = `
                <div class="doc-controls doc-controls-bar">
                    ${canEdit ? `<button class="bpmn-btn primary" id="editDoc">Edit Document</button>` : ''}
                    <button class="bpmn-btn primary btn-download-md" id="btn-export-md">Download MD</button>
                    <button class="bpmn-btn primary btn-print-doc" id="btn-print-doc">Print / PDF</button>

                    <div id="editDocControls" class="bpmn-controls-group hidden">
                         <button class="bpmn-btn primary" id="saveDoc">Save Changes</button>
                         <button class="bpmn-btn" id="cancelDocEdit">Cancel</button>
                    </div>
                </div>
                <div id="markdown-content" class="markdown-content">${marked.parse(content)}</div>
                <textarea id="markdown-editor" class="hidden"></textarea>
            `;

      if (canEdit) document.getElementById('editDoc').onclick = () => switchToDocEditMode();
      document.getElementById('btn-export-md').onclick = downloadMarkdown;
      document.getElementById('btn-print-doc').onclick = printDoc;
    } else {
      modalBody.textContent =
        typeof content === 'object' ? JSON.stringify(content, null, 2) : content;
    }
  }

  // BPMN Helper Functions
  function loadBpmnViewer(xml) {
    destroyBpmn();

    bpmnInstance = new BpmnJS({
      container: '#bpmn-canvas',
      height: 600,
    });

    bpmnInstance
      .importXML(xml)
      .then(() => {
        const canvas = bpmnInstance.get('canvas');
        canvas.zoom('fit-viewport');

        const palette = document.querySelector('.djs-palette');
        if (palette) palette.style.display = 'none';

        const editBtn = document.getElementById('editBpmn');
        if (editBtn) editBtn.onclick = () => switchToEditMode();

        const resetBtn = document.getElementById('resetZoom');
        if (resetBtn) resetBtn.onclick = () => canvas.zoom('fit-viewport');

        const dlBtn = document.getElementById('downloadSvg');
        if (dlBtn) dlBtn.onclick = downloadSvg;
      })
      .catch((err) => {
        console.error('BPMN Import Error', err);
        const canvas = document.getElementById('bpmn-canvas');
        if (canvas)
          canvas.innerHTML = `<p class="error-inline">Error rendering BPMN: ${err.message}</p>`;
      });
  }

  function switchToEditMode() {
    destroyBpmn();

    document.getElementById('viewControls').classList.add('hidden');
    document.getElementById('editControls').classList.remove('hidden');

    bpmnInstance = new BpmnJS({
      container: '#bpmn-canvas',
      height: 600,
    });

    bpmnInstance
      .importXML(currentArtifactContent)
      .then(() => {
        const canvas = bpmnInstance.get('canvas');
        canvas.zoom('fit-viewport');

        const palette = document.querySelector('.djs-palette');
        if (palette) palette.style.display = 'block';

        document.getElementById('saveBpmn').onclick = saveBpmnChanges;
        document.getElementById('cancelEdit').onclick = cancelEdit;
      })
      .catch(async (err) => {
        console.error('Modeler Error', err);
        if (window.showAlertModal) await window.showAlertModal('Error entering edit mode');
      });
  }

  async function saveBpmnChanges() {
    try {
      const { xml } = await bpmnInstance.saveXML({ format: true });

      const saveBtn = document.getElementById('saveBpmn');
      saveBtn.textContent = 'Saving...';
      saveBtn.disabled = true;

      const res = await fetch(`/api/artifacts/${currentArtifactId}/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: xml }),
      });

      if (!res.ok) throw new Error('Save failed');

      currentArtifactContent = xml;
      cancelEdit();
    } catch (err) {
      console.error(err);
      if (window.showAlertModal) await window.showAlertModal('Failed to save changes');
      const saveBtn = document.getElementById('saveBpmn');
      if (saveBtn) {
        saveBtn.textContent = 'Save Changes';
        saveBtn.disabled = false;
      }
    }
  }

  function cancelEdit() {
    document.getElementById('viewControls').classList.remove('hidden');
    document.getElementById('editControls').classList.add('hidden');
    loadBpmnViewer(currentArtifactContent);
  }

  async function downloadSvg() {
    try {
      const { svg } = await bpmnInstance.saveSVG();
      downloadFile(`process.svg`, svg, 'image/svg+xml');
    } catch (err) {
      console.error('Error saving SVG', err);
    }
  }

  function destroyBpmn() {
    if (bpmnInstance) {
      bpmnInstance.destroy();
      bpmnInstance = null;
    }
  }

  // Markdown Functions
  function switchToDocEditMode() {
    document.getElementById('editDoc').style.display = 'none';
    document.getElementById('btn-export-md').style.display = 'none';
    document.getElementById('btn-print-doc').style.display = 'none';

    const controls = document.getElementById('editDocControls');
    controls.classList.remove('hidden');
    controls.style.display = 'flex';

    document.getElementById('markdown-content').style.display = 'none';

    const textArea = document.getElementById('markdown-editor');
    easyMDEInstance = new EasyMDE({
      element: textArea,
      initialValue: currentArtifactContent,
      spellChecker: false,
      status: false,
    });

    document.getElementById('saveDoc').onclick = saveDocChanges;
    document.getElementById('cancelDocEdit').onclick = cancelDocEdit;
  }

  async function saveDocChanges() {
    try {
      const newContent = easyMDEInstance.value();
      const saveBtn = document.getElementById('saveDoc');
      saveBtn.textContent = 'Saving...';
      saveBtn.disabled = true;

      const res = await fetch(`/api/artifacts/${currentArtifactId}/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent }),
      });

      if (!res.ok) throw new Error('Save failed');

      currentArtifactContent = newContent;
      cancelDocEdit();
    } catch (err) {
      console.error(err);
      if (window.showAlertModal) await window.showAlertModal('Failed to save changes');
      const saveBtn = document.getElementById('saveDoc');
      if (saveBtn) {
        saveBtn.textContent = 'Save Changes';
        saveBtn.disabled = false;
      }
    }
  }

  function cancelDocEdit() {
    destroyDocEditor();
    const viewDiv = document.getElementById('markdown-content');
    viewDiv.innerHTML = marked.parse(currentArtifactContent);
    viewDiv.style.display = 'block';

    document.getElementById('editDoc').style.display = 'inline-block';
    document.getElementById('btn-export-md').style.display = 'inline-block';
    document.getElementById('btn-print-doc').style.display = 'inline-block';
    document.getElementById('editDocControls').style.display = 'none';
  }

  function destroyDocEditor() {
    if (easyMDEInstance) {
      easyMDEInstance.toTextArea();
      easyMDEInstance = null;
    }
  }

  // Export Utils
  function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function downloadBpmnXml() {
    if (!bpmnInstance) return;
    try {
      const { xml } = await bpmnInstance.saveXML({ format: true });
      downloadFile(`process-${currentArtifactId}.bpmn`, xml, 'application/xml');
    } catch (err) {
      console.error('Error exporting BPMN XML', err);
    }
  }

  async function downloadBpmnPng() {
    if (!bpmnInstance) return;
    try {
      const { svg } = await bpmnInstance.saveSVG();
      const img = new Image();
      const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      img.onload = function () {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        canvas.toBlob(function (blob) {
          const pngUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = pngUrl;
          a.download = `process-${currentArtifactId}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(pngUrl);
          URL.revokeObjectURL(url);
        }, 'image/png');
      };
      img.src = url;
    } catch (err) {
      console.error('Error exporting BPMN PNG', err);
    }
  }

  function downloadTableCsv(type) {
    if (!Array.isArray(currentArtifactContent)) return;

    const isSipoc = type === 'sipoc';
    const headers = isSipoc
      ? ['Supplier', 'Input', 'Process', 'Output', 'Customer']
      : ['Activity', 'Responsible', 'Accountable', 'Consulted', 'Informed'];

    const keys = isSipoc
      ? ['supplier', 'input', 'process_step', 'output', 'customer']
      : ['activity', 'responsible', 'accountable', 'consulted', 'informed'];

    let csvContent = headers.join(',') + '\n';
    currentArtifactContent.forEach((row) => {
      const rowData = keys.map((key) => {
        let val = row[key] || '';
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          val = `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      });
      csvContent += rowData.join(',') + '\n';
    });

    downloadFile(`${type}-${currentArtifactId}.csv`, csvContent, 'text/csv;charset=utf-8;');
  }

  function downloadMarkdown() {
    downloadFile(
      `doc-${currentArtifactId}.md`,
      currentArtifactContent,
      'text/markdown;charset=utf-8',
    );
  }

  function printDoc() {
    window.print();
  }

  // Editable Table Methods
  function switchToTableEditMode(type) {
    document.querySelector('.table-controls button').classList.add('hidden');
    const exportBtn = document.getElementById('btn-export-csv');
    if (exportBtn) exportBtn.classList.add('hidden');

    const controls = document.getElementById('editTableControls');
    controls.classList.remove('hidden');

    const container = document.getElementById('table-container');
    container.innerHTML = generateEditableTable(type, currentArtifactContent);
  }

  function cancelTableEdit() {
    renderModalContent(
      currentArtifactType,
      currentArtifactContent,
      currentArtifactId,
      currentCanEdit,
    );
  }

  function generateEditableTable(type, data) {
    let headers = [];
    let keys = [];

    if (type === 'sipoc') {
      headers = ['Supplier', 'Input', 'Process', 'Output', 'Customer'];
      keys = ['supplier', 'input', 'process_step', 'output', 'customer'];
    } else {
      headers = ['Activity', 'Responsible', 'Accountable', 'Consulted', 'Informed'];
      keys = ['activity', 'responsible', 'accountable', 'consulted', 'informed'];
    }

    let html = `<table class="data-table" id="editTable"><thead><tr>`;
    headers.forEach((h) => (html += `<th>${h}</th>`));
    html += `<th>Action</th></tr></thead><tbody>`;

    data.forEach((row) => {
      html += `<tr>`;
      keys.forEach((key) => {
        html += `<td><input type="text" class="table-input" data-key="${key}" value="${(row[key] || '').replace(/"/g, '&quot;')}" /></td>`;
      });
      html += `<td><button class="delete-row-btn">&times;</button></td></tr>`;
    });
    html += `</tbody></table>`;
    return html;
  }

  function addTableRow(type) {
    const tbody = document.querySelector('#editTable tbody');
    const tr = document.createElement('tr');

    let keys =
      type === 'sipoc'
        ? ['supplier', 'input', 'process_step', 'output', 'customer']
        : ['activity', 'responsible', 'accountable', 'consulted', 'informed'];

    let html = '';
    keys.forEach((key) => {
      html += `<td><input type="text" class="table-input" data-key="${key}" value="" /></td>`;
    });
    html += `<td><button class="delete-row-btn">&times;</button></td>`;
    tr.innerHTML = html;
    tbody.appendChild(tr);
  }

  async function saveTableChanges(_type) {
    try {
      const rows = document.querySelectorAll('#editTable tbody tr');
      const newData = [];

      rows.forEach((tr) => {
        const rowObj = {};
        const inputs = tr.querySelectorAll('input');
        inputs.forEach((input) => {
          rowObj[input.dataset.key] = input.value;
        });
        newData.push(rowObj);
      });

      const saveBtn = document.querySelector('#btn-save-table');
      saveBtn.textContent = 'Saving...';
      saveBtn.disabled = true;

      const res = await fetch(`/api/artifacts/${currentArtifactId}/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newData }),
      });

      if (!res.ok) throw new Error('Save failed');

      currentArtifactContent = newData;
      cancelTableEdit();
    } catch (err) {
      console.error(err);
      if (window.showAlertModal) await window.showAlertModal('Failed to save changes');
      const saveBtn = document.querySelector('#btn-save-table');
      if (saveBtn) {
        saveBtn.textContent = 'Save Changes';
        saveBtn.disabled = false;
      }
    }
  }

  function setupEventListeners() {
    closeModal.addEventListener('click', () => history.back());

    window.addEventListener('click', (e) => {
      if (e.target === modal) history.back();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
        history.back();
      }
    });

    window.addEventListener('popstate', () => {
      closeArtifactModal();
    });

    modalBody.addEventListener('click', (e) => {
      const deleteBtn = e.target.closest('.delete-row-btn');
      if (deleteBtn) {
        deleteBtn.closest('tr').remove();
      }
    });
  }

  function init() {
    modal = document.getElementById('artifactModal');
    modalTitle = document.getElementById('modalTitle');
    modalBody = document.getElementById('modalBody');
    closeModal = document.querySelector('.close-modal');

    if (modal) {
      setupEventListeners();
    }
  }

  return {
    init,
    viewArtifact,
  };
})();
