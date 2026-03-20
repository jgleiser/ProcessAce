const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { saveEvidence, Evidence, getEvidence } = require('../models/evidence');
const { evidenceQueue } = require('../services/queueInstance');
const settingsService = require('../services/settingsService');
const workspaceService = require('../services/workspaceService');
const authService = require('../services/authService');
const { auditMiddleware } = require('../middleware/auditMiddleware');
const { AppError, sendErrorResponse } = require('../utils/errorResponse');
const { sanitizeFilename } = require('../utils/sanitizeFilename');
const { isAdminRole } = require('../utils/roles');

const router = express.Router();
const parsedMaxUploadSizeMb = Number.parseInt(process.env.MAX_UPLOAD_SIZE_MB || '100', 10);
const MAX_UPLOAD_SIZE_MB = Number.isFinite(parsedMaxUploadSizeMb) && parsedMaxUploadSizeMb > 0 ? parsedMaxUploadSizeMb : 100;
const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  '.mp3',
  '.m4a',
  '.wav',
  '.mp4',
  '.webm',
  '.ogg',
  '.flac',
  '.mpeg',
  '.mpga',
  '.oga',
  '.txt',
  '.md',
  '.pdf',
  '.doc',
  '.docx',
]);

const isWithinUploadsDir = (absolutePath) => absolutePath === UPLOADS_DIR || absolutePath.startsWith(`${UPLOADS_DIR}${path.sep}`);

const resolveTranscriptAudioVariant = async (evidence, logger) => {
  const metadata = evidence.metadata && typeof evidence.metadata === 'object' ? evidence.metadata : {};
  const transcriptionMetadata = metadata.transcription && typeof metadata.transcription === 'object' ? metadata.transcription : {};

  const convertedAudioPath = typeof transcriptionMetadata.convertedAudioPath === 'string' ? transcriptionMetadata.convertedAudioPath.trim() : '';

  if (!convertedAudioPath) {
    return null;
  }

  const absoluteConvertedAudioPath = path.resolve(convertedAudioPath);
  if (!isWithinUploadsDir(absoluteConvertedAudioPath)) {
    logger.warn(
      {
        evidenceId: evidence.id,
        convertedAudioPath,
      },
      'Ignoring transcription audio variant outside uploads directory',
    );
    return null;
  }

  try {
    await fs.promises.access(absoluteConvertedAudioPath, fs.constants.R_OK);
  } catch (err) {
    if (err.code === 'ENOENT') {
      logger.warn(
        {
          evidenceId: evidence.id,
          convertedAudioPath: absoluteConvertedAudioPath,
        },
        'Converted transcription audio file is missing, falling back to original evidence file',
      );
      return null;
    }
    throw err;
  }

  return {
    absolutePath: absoluteConvertedAudioPath,
    mimeType: transcriptionMetadata.convertedAudioMimeType || 'audio/mpeg',
    filename:
      transcriptionMetadata.convertedAudioFilename ||
      `${path.basename(evidence.originalName || evidence.filename, path.extname(evidence.originalName || evidence.filename))}.mp3`,
  };
};

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

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    const extension = path.extname(file.originalname || '').toLowerCase();

    if (!ALLOWED_UPLOAD_EXTENSIONS.has(extension)) {
      return cb(
        new AppError(
          415,
          'Unsupported media type. Allowed file types: .mp3, .m4a, .wav, .mp4, .webm, .ogg, .flac, .mpeg, .mpga, .oga, .txt, .md, .pdf, .doc, .docx.',
        ),
      );
    }

    return cb(null, true);
  },
});

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

    req.log.info(
      {
        event_type: 'upload_received',
        storedFilename: req.file.filename,
        mimeType: req.file.mimetype,
        size: req.file.size,
        uploadType: req.body.uploadType,
        extension: ext,
        isAudio,
      },
      'Evidence upload accepted for processing',
    );

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
 * GET /api/evidence/:id/file
 * Stream the original evidence file for playback.
 */
router.get(
  '/:id/file',
  auditMiddleware('evidence', (req) => req.params.id),
  async (req, res) => {
    try {
      const { id } = req.params;
      const evidence = await getEvidence(id);

      if (!evidence) {
        return res.status(404).json({ error: 'Evidence not found' });
      }

      let canView = false;
      if (evidence.user_id && evidence.user_id === req.user.id) {
        canView = true;
      }

      if (!canView && evidence.workspace_id) {
        const role = workspaceService.getMemberRole(evidence.workspace_id, req.user.id);
        if (['admin', 'editor', 'owner', 'viewer'].includes(role)) {
          canView = true;
        }
      }

      if (!canView) {
        const user = authService.getUserById(req.user.id);
        if (!user || !isAdminRole(user.role)) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }

      let sourcePath = evidence.path;
      let sourceMimeType = evidence.mimeType || 'application/octet-stream';
      let sourceFilename = evidence.originalName || evidence.filename;

      if (req.query.variant === 'transcription') {
        const transcriptAudioVariant = await resolveTranscriptAudioVariant(evidence, req.log);
        if (transcriptAudioVariant) {
          sourcePath = transcriptAudioVariant.absolutePath;
          sourceMimeType = transcriptAudioVariant.mimeType;
          sourceFilename = transcriptAudioVariant.filename;
        }
      }

      const absolutePath = path.resolve(sourcePath);
      if (!isWithinUploadsDir(absolutePath)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const stat = await fs.promises.stat(absolutePath);
      const fileSize = stat.size;

      const downloadName = sanitizeFilename(sourceFilename, `evidence-${id}`);
      res.setHeader('Content-Type', sourceMimeType);
      res.setHeader('Content-Disposition', `inline; filename="${downloadName}"`);
      res.setHeader('Accept-Ranges', 'bytes');

      const range = req.headers.range;
      if (range) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(range);
        if (!match) {
          return res.status(416).json({ error: 'Invalid range' });
        }

        const start = Number(match[1]);
        const end = match[2] ? Number(match[2]) : fileSize - 1;

        if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || end >= fileSize || start > end) {
          return res.status(416).json({ error: 'Invalid range' });
        }

        const chunkSize = end - start + 1;
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
        res.setHeader('Content-Length', chunkSize);

        const stream = fs.createReadStream(absolutePath, { start, end });
        stream.on('error', (err) => {
          req.log.error({ err, evidenceId: id }, 'Evidence file stream failed');
          if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to stream evidence' });
          }
        });
        return stream.pipe(res);
      }

      res.setHeader('Content-Length', fileSize);
      const stream = fs.createReadStream(absolutePath);
      stream.on('error', (err) => {
        req.log.error({ err, evidenceId: id }, 'Evidence file stream failed');
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to stream evidence' });
        }
      });
      stream.pipe(res);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return res.status(404).json({ error: 'Evidence file not found' });
      }
      req.log.error({ err, evidenceId: req.params.id }, 'Evidence file retrieval failed');
      return res.status(500).json({ error: 'Failed to load evidence file' });
    }
  },
);

/**
 * POST /api/evidence/:id/process-text
 * Accept edited transcript text and enqueue process_evidence without mutating evidence file pointers.
 */
router.post('/:id/process-text', async (req, res) => {
  try {
    const { id } = req.params;
    const { text, processName, workspaceId } = req.body;

    if (typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Transcript text is required' });
    }

    const evidence = await getEvidence(id);
    if (!evidence) {
      return res.status(404).json({ error: 'Evidence not found' });
    }

    const { provider, model } = settingsService.getLLMConfig();

    // Enqueue standard processing job
    const job = await evidenceQueue.add(
      'process_evidence',
      {
        evidenceId: evidence.id,
        filename: evidence.filename,
        originalName: evidence.originalName,
        processName:
          processName || (evidence.originalName ? evidence.originalName.replace(/\.[^/.]+$/, '') : evidence.filename.replace(/\.[^/.]+$/, '')),
        transcriptText: text,
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

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return sendErrorResponse(res, new AppError(413, `File too large. Maximum upload size is ${MAX_UPLOAD_SIZE_MB}MB.`), req);
  }

  if (error instanceof AppError) {
    return sendErrorResponse(res, error, req);
  }

  return next(error);
});

module.exports = router;
