/* global marked, BpmnJS, EasyMDE, showConfirmModal, showAlertModal */

document.addEventListener('DOMContentLoaded', async () => {
  // Auth Check and UI updates are now handled by header.js

  // Initialize components
  if (window.WorkspaceManager) {
    window.WorkspaceManager.init();
  }

  if (window.EvidenceUpload) {
    window.EvidenceUpload.init();
  }

  if (window.JobTracker) {
    window.JobTracker.init();
  }

  if (window.ArtifactViewer) {
    window.ArtifactViewer.init();
  }
});
