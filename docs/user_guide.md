# ProcessAce User Guide

## Overview
ProcessAce helps you document and analyze processes by uploading evidence (documents, recordings) and automatically generating standard artifacts like BPMN diagrams, SIPOC tables, and Narrative documentation.

## Getting Started

### 1. Uploading Evidence
1.  Navigate to the **Upload** section on the main dashboard.
2.  Drag and drop your file (e.g., text document, transcript) into the drop zone.
3.  **Select Provider & Model**: Choose between OpenAI, Google GenAI, or Anthropic, and specify a model if needed.
4.  (Optional) Enter a specific **Process Name**.
5.  The system will process the file in the background. You can track progress in the **Jobs** list.

### 2. Viewing Artifacts
Once a job is **Completed**, you will see a list of generated artifacts:
-   **BPMN**: Process Diagram.
-   **SIPOC**: Supplier-Input-Process-Output-Customer matrix.
-   **RACI**: Responsible-Accountable-Consulted-Informed matrix.
-   **DOC**: Narrative documentation in Markdown.

Click the **Eye Icon (👁️)** to view an artifact in the interactive modal.
Click the **Button Label** to download the file directly.

## Interactive Editing
You can now edit generated artifacts directly within the browser.

### BPMN Diagram
1.  Open the BPMN artifact.
2.  Click **Edit Diagram**.
3.  Use the palette on the left to add tasks, gateways, or events.
4.  Drag items to move them. Connections will update automatically.
5.  Click **Save Changes** to persist your edits.
6.  Click **Download SVG** to save an image of the current diagram.

### Narrative Documentation (Markdown)
1.  Open the DOC artifact.
2.  Click **Edit Document**.
3.  Use the toolbar for formatting (Bold, Italic, Lists, Headers).
4.  Switch to "Side-by-Side" preview using the eye icon in the toolbar.
5.  Click **Save Changes** to update the document.

### SIPOC & RACI Tables
1.  Open a SIPOC or RACI artifact.
2.  Click **Edit SIPOC** (or **Edit RACI**).
3.  **To Edit Cells**: Click inside any cell and type your changes.
4.  **To Add Rows**: Click **+ Add Row**.
5.  **To Delete Rows**: Click the **×** button at the end of the row.
6.  Click **Save Changes** to save.

## Troubleshooting
-   **"Marked not defined"**: Ensure your browser can access external scripts (CDN) or rebuild the application if running locally.
-   **Save Errors**: Check that the backend service is running and properly connected to the database.
