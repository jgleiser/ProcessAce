const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { saveEvidence, Evidence, getEvidence, updateEvidencePath } = require('../models/evidence');
const { evidenceQueue } = require('../services/queueInstance');
const settingsService = require('../services/settingsService');

const router = express.Router();

// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

// Initialize JobQueue (ideally simulated dependency injection)
// const evidenceQueue = new JobQueue('evidence-queue'); // REPLACED WITH SINGLETON

/**
 * POST /api/evidence/upload
 * Upload a file (video, audio, image, doc) for processing.
 * Creates an Evidence record and enqueues a processing job.
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Fix multer/busboy encoding issue for filenames with special characters (UTF-8 parsed as latin1)
    req.file.originalname = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

    // 1. Create Evidence record
    const evidence = new Evidence({
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      path: req.file.path,
      user_id: req.user.id,
      workspace_id: req.body.workspaceId || null,
    });

    await saveEvidence(evidence);

    // Audio/Video route
    const ext = path.extname(req.file.originalname).toLowerCase();
    const audioExts = ['.mp3', '.m4a', '.wav', '.mp4', '.webm', '.ogg', '.flac', '.mpeg', '.mpga', '.oga'];
    const isAudio =
      req.body.uploadType === 'audio' || req.file.mimetype.startsWith('audio/') || req.file.mimetype.startsWith('video/') || audioExts.includes(ext);

    req.log.info({ file: req.file, uploadType: req.body.uploadType, ext, isAudio }, 'Upload Details Debug');

    if (isAudio) {
      const job = await evidenceQueue.add(
        'transcribe_evidence',
        {
          evidenceId: evidence.id,
          filename: evidence.filename,
          originalName: evidence.originalName,
          processName: req.body.processName,
        },
        {
          userId: req.user.id,
          workspaceId: req.body.workspaceId || null,
        },
      );

      return res.status(202).json({
        message: 'Upload accepted for transcription',
        evidenceId: evidence.id,
        jobId: job.id,
        phase: 'transcription',
        statusUrl: `/api/jobs/${job.id}`,
      });
    }

    // Default text/document route
    const { provider, model } = settingsService.getLLMConfig();

    // 2. Enqueue Job
    const job = await evidenceQueue.add(
      'process_evidence',
      {
        evidenceId: evidence.id,
        filename: evidence.filename,
        originalName: evidence.originalName, // Pass original filename for derivation
        processName: req.body.processName, // Optional custom name
        provider,
        model,
      },
      {
        userId: req.user.id,
        workspaceId: req.body.workspaceId || null,
      },
    );

    return res.status(202).json({
      message: 'Upload accepted',
      evidenceId: evidence.id,
      jobId: job.id,
      phase: 'processing',
      statusUrl: `/api/jobs/${job.id}`, // Placeholder URL
    });
  } catch (err) {
    req.log.error({ err }, 'Upload failed');
    res.status(500).json({ error: 'Upload failed' });
  }
});

/**
 * POST /api/evidence/:id/process-text
 * Accept edited transcript text, write to file, and enqueue process_evidence
 */
router.post('/:id/process-text', async (req, res) => {
  try {
    const { id } = req.params;
    const { text, processName, workspaceId } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Transcript text is required' });
    }

    const evidence = await getEvidence(id);
    if (!evidence) {
      return res.status(404).json({ error: 'Evidence not found' });
    }

    // Write text to a new temporary .txt file
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const newFilename = `transcript-${uniqueSuffix}.txt`;
    const newPath = path.join('uploads', newFilename);

    await fs.writeFile(newPath, text, 'utf8');

    // Update evidence path
    await updateEvidencePath(id, newPath, newFilename);

    const { provider, model } = settingsService.getLLMConfig();

    // Enqueue standard processing job
    const job = await evidenceQueue.add(
      'process_evidence',
      {
        evidenceId: evidence.id,
        filename: newFilename,
        originalName: evidence.originalName,
        processName: processName || evidence.originalName.replace(/\.[^/.]+$/, ''),
        provider,
        model,
      },
      {
        userId: req.user.id,
        workspaceId: workspaceId || evidence.workspace_id,
      },
    );

    res.status(202).json({
      message: 'Transcript accepted for processing',
      evidenceId: evidence.id,
      jobId: job.id,
      phase: 'processing',
      statusUrl: `/api/jobs/${job.id}`,
    });
  } catch (err) {
    req.log.error({ err, evidenceId: req.params.id }, 'Process text failed');
    res.status(500).json({ error: 'Processing failed' });
  }
});

// Expose queue instance for worker registration (hacky for Phase 1)
// router.queue = evidenceQueue; // REMOVED

module.exports = router;
