# ProcessAce User Guide

## Overview

ProcessAce helps you document and analyze processes by uploading evidence (text documents or audio/video) and automatically generating standard artifacts like BPMN diagrams, SIPOC tables, RACI matrices, and Narrative documentation using AI. Audio/video evidence is transcribed first, reviewed by a user, and then processed into artifacts.

## Getting Started

### 1. Create an Account & Login

1. Navigate to `/register.html` to create a new account.
2. Enter your **name**, **email**, and **password** (must be 8+ characters with uppercase, lowercase, and numbers).
3. Click **Register**.
4. The first registered user automatically becomes a **Superadmin** and can sign in immediately.
5. Later self-registrations are created as **pending** accounts and must be approved by an Admin or Superadmin before login.
6. Go to `/login.html` and sign in once the account is active.
7. You'll be redirected to the main dashboard.

### 2. Configure LLM Provider (Admin / Superadmin)

Before processing files, an Admin or Superadmin must configure the LLM provider:

1. Go to **App Settings** (`/app-settings.html`).
2. Select a **Provider** (OpenAI, Google GenAI, or Anthropic).
3. Enter the **API Key** for the selected provider.
4. Click **Save**. API keys are stored encrypted in the database.
5. Optionally, use **Verify & Load Models** to confirm the key works and see available models.
6. If using audio/video, configure **Transcription Settings** (provider, STT model, max file size).

### 3. Workspaces & Collaboration

Workspaces help you organize your processes and collaborate with your team.

#### Managing Workspaces

1. **View Current Workspace**: The workspace selector is in the top-right header.
2. **Switch Workspaces**: Select a different workspace from the dropdown.
   - **My Workspaces**: Workspaces you own.
   - **Shared Workspaces**: Workspaces you have been invited to.
3. **Create New Workspace**: Click the **+ New** button, enter a name, and click **Create**.

#### Managing Members (Owner Only)

If you are the owner of a workspace, you can manage its members:

1. Click the **Settings (⚙️)** icon next to the workspace name in the header (or go to **Workspace Settings**).
2. **Invite Users**:
   - Enter the email address of the user you want to invite.
   - Select a role: **Viewer** (read-only) or **Editor** (can upload/edit).
   - Click **Invite**. An invitation email will be sent (simulated in development).
3. **Manage Invitations**:
   - See pending invitations in the "Pending Invitations" list.
   - Click **Revoke** to cancel an invitation.
4. **Manage Members**:
   - View current members and their roles.
   - **Change Role**: Update a member's role (e.g., Viewer to Editor).
   - **Remove Member**: Click the **Delete (🗑️)** icon to remove a user from the workspace.

#### Joining a Workspace

1. When invited, you will receive a notification (or see a pending invite in your list).
2. Go to your **Notifications** or check your email for the invite link.
3. **Accept** the invitation to join the workspace.
4. The new workspace will appear in your **Shared Workspaces** list.

> **Note**: Jobs and artifacts are scoped to the current workspace. All members of a workspace can see its content, but only Editors and Owners can make changes.

### 4. Uploading Evidence

1. Navigate to the **Upload** section on the main dashboard.
2. Choose the **Document** or **Audio / Video** tab.
3. Drag and drop your file into the drop zone.
4. **Select Provider & Model**: Choose between OpenAI, Google GenAI, or Anthropic for artifact generation (or leave defaults).
5. (Optional) Enter a custom **Process Name** (otherwise the filename is used).
6. The system will process the file in the background. You can track progress in the **Jobs** list.

Audio/video uploads run in two phases:

1. **Transcription** creates a transcript artifact.
2. **Review & Process** uses the edited transcript to generate BPMN/SIPOC/RACI/Doc artifacts.

### 5. Transcript Review (Audio/Video)

1. When transcription completes, the job card shows a **Review** button.
2. Open the transcript review modal to edit text and listen to the audio when available.
3. **Save Changes** to store edits without starting processing.
4. **Export to TXT** to download the transcript.
5. **Confirm & Process** to generate process artifacts from the edited transcript.

### 6. Viewing Artifacts

Once a job is **Completed**, you will see a list of generated artifacts:

- **BPMN**: Process Diagram (XML).
- **SIPOC**: Supplier-Input-Process-Output-Customer matrix (JSON).
- **RACI**: Responsible-Accountable-Consulted-Informed matrix (JSON).
- **DOC**: Narrative documentation (Markdown).

Click an artifact button to view it in the interactive modal.
Use the export controls inside the viewer to download files (BPMN, CSV, DOCX, PDF).

### 7. Exporting Artifacts

You can export artifacts in various formats from the interactive view:

- **BPMN**:
  - **Export XML**: Download the `.bpmn` file for use in other tools (e.g., Camunda, Signavio, Bizagi).
  - **Export PNG**: Download a high-resolution image of the diagram.
  - **Download SVG**: Download the vector image.
- **SIPOC / RACI**:
  - **Export CSV**: Download the table as a CSV file compatible with Excel and Google Sheets.
- **Narrative (Doc)**:
  - **Download MD**: Download the raw Markdown file.
  - **Export DOCX**: Download the document in Microsoft Word format.
  - **Print / PDF**: Open a clean, print-friendly view to save as PDF.

### 8. Process Name

- You can set a **Process Name** at upload time.
- To change it after creation, click the **Edit (✏️)** icon next to the process name in the job card.

## Interactive Editing

You can edit generated artifacts directly within the browser.

### BPMN Diagram

1. Open the BPMN artifact.
2. Click **Edit Diagram**.
3. Use the palette on the left to add tasks, gateways, or events.
4. Drag items to move them. Connections will update automatically.
5. Click **Save Changes** to persist your edits.
6. Click **Download SVG** to save an image of the current diagram.

### Narrative Documentation (Markdown)

1. Open the DOC artifact.
2. Click **Edit Document**.
3. Use the toolbar for formatting (Bold, Italic, Lists, Headers).
4. Switch to "Side-by-Side" preview using the eye icon in the toolbar.
5. Click **Save Changes** to update the document.

### SIPOC & RACI Tables

1. Open a SIPOC or RACI artifact.
2. Click **Edit SIPOC** (or **Edit RACI**).
3. **To Edit Cells**: Click inside any cell and type your changes.
4. **To Add Rows**: Click **+ Add Row**.
5. **To Delete Rows**: Click the **×** button at the end of the row.
6. Click **Save Changes** to save.

## Administration

### User Management

1. Go to **Admin** (`/admin-users.html`).
2. View all registered users with their name, email, role, and status.
3. **Change Role**:
   - Superadmins can assign **Superadmin**, **Admin**, **Editor**, or **Viewer**.
   - Regular Admins can manage non-privileged users and keep operational admin tasks, but they cannot assign or revoke Admin/Superadmin roles.
4. **Change Status**: Toggle between Active and Inactive. Inactive users cannot log in.
5. **Approve / Reject Registrations**: Pending users show dedicated approval actions. Rejected users remain visible and can be approved later if access is restored.

> **Note**: Users cannot change their own role from the admin page, and the last active Superadmin cannot be deactivated or demoted.

### Admin Jobs Dashboard

1. Go to **Admin Jobs** (`/admin-jobs.html`).
2. View all jobs across all users and workspaces with pagination.
3. See the LLM provider, model, user, and workspace for each job.
4. Filter by **Job Type** to separate transcription from artifact generation.
5. View artifacts for any job, including transcript playback when available.

### App Settings

1. Go to **App Settings** (`/app-settings.html`).
2. Configure the default LLM provider and model.
3. Manage API keys for each provider (stored encrypted).
4. For **Ollama (Local)**, configure the provider-specific base URL for your deployment mode.
5. Use **2.1 Local Model Manager** to install, remove, and select curated local generation models.
6. Configure transcription settings separately: provider, STT model, and max file size before chunking.
7. Use **Load Transcription Models** to fetch supported STT models for OpenAI.
8. Superadmins also see the destructive **Delete All Data** section:
   - Type `DELETE ALL`
   - Enter the current password
   - Confirm the reset to return the instance to an empty bootstrap state

Ollama-specific setup depends on the host OS and hardware. Use the dedicated guide for deployment choices, hardware guidance, and troubleshooting:

- [Ollama Guide](./ollama_guide.md)

## User Settings

1. Go to **User Settings** (`/user-settings.html`) or click your name in the header.
2. Update your **display name**.
3. Change your **password** (requires current password confirmation).
4. Review your **Privacy & Data** section:
   - Account creation date
   - Last login date
   - Consent history
5. Use **Export My Data** to download your JSON data export.
6. Use **Deactivate My Account** if you should no longer access the installation.
   - Deactivation preserves organizational data.
   - Any workspaces you own are transferred to the primary Superadmin.

## Troubleshooting

- **"Marked not defined"**: Ensure your browser can access external scripts (CDN) or rebuild the application if running locally.
- **Save Errors**: Check that the backend service is running and the database is accessible.
- **401 Unauthorized**: Your session may have expired. Refresh the page to be redirected to login.
- **403 Pending Approval**: A newly created account may still need administrator approval before it can log in.
- **LLM Errors**: Verify your API key is correct in App Settings. Use the **Verify & Load Models** button to test connectivity.
- **Ollama Issues**: Confirm the base URL matches your deployment mode and review the [Ollama Guide](./ollama_guide.md).
